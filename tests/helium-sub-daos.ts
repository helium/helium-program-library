import { init as cbInit } from "@helium/circuit-breaker-sdk";
import { CircuitBreaker } from "@helium/idls/lib/types/circuit_breaker";
import { HeliumSubDaos } from "@helium/idls/lib/types/helium_sub_daos";
import { createAtaAndMint, createMint, sendInstructions, toBN } from "@helium/spl-utils";
import { Keypair as HeliumKeypair } from "@helium/crypto";
import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { AccountLayout, getAssociatedTokenAddress } from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram
} from "@solana/web3.js";
import { assert, expect } from "chai";
import { AggregatorAccount, loadSwitchboardProgram } from "@switchboard-xyz/switchboard-v2";
import { init as dcInit } from "../packages/data-credits-sdk/src";
import { heliumSubDaosResolvers, stakePositionKey } from "../packages/helium-sub-daos-sdk/src";
import { init as issuerInit } from "../packages/helium-entity-manager-sdk/src";
import { heliumSubDaosResolvers } from "../packages/helium-sub-daos-sdk/src";
import { DataCredits } from "../target/types/data_credits";
import { HeliumEntityManager } from "../target/types/helium_entity_manager";
import { burnDataCredits } from "./data-credits";
import { initTestDao, initTestSubdao } from "./utils/daos";
import { DC_FEE, ensureDCIdl, ensureHSDIdl, initWorld } from "./utils/fixtures";
import { createNft } from "@helium/spl-utils";
import { init as cbInit } from "@helium/circuit-breaker-sdk";
import { CircuitBreaker } from "@helium/idls/lib/types/circuit_breaker";
import { VoterStakeRegistry, IDL } from "../deps/helium-voter-stake-registry/src/voter_stake_registry";
import { initVsr, VSR_PID } from "./utils/vsr";
import { BN } from "bn.js";

const THREAD_PID = new PublicKey("3XXuUFfweXBwFgFfYaejLvZE4cGZiHgKiGfMtdxNzYmv");

const EPOCH_REWARDS = 100000000;
const SUB_DAO_EPOCH_REWARDS = 10000000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe("helium-sub-daos", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  const program = new Program<HeliumSubDaos>(
    anchor.workspace.HeliumSubDaos.idl,
    anchor.workspace.HeliumSubDaos.programId,
    anchor.workspace.HeliumSubDaos.provider,
    anchor.workspace.HeliumSubDaos.coder,
    () => {
      return heliumSubDaosResolvers;
    }
  );

  let dcProgram: Program<DataCredits>;
  let hemProgram: Program<HeliumEntityManager>;
  let cbProgram: Program<CircuitBreaker>;
  let vsrProgram: Program<VoterStakeRegistry>;

  let registrar: PublicKey;
  let voter: PublicKey;
  let vault: PublicKey;
  let hntMint: PublicKey;
  let voterKp: Keypair;
  let thread: PublicKey;
  let remainingAccounts: ({pubkey: PublicKey, isWritable: boolean, isSigner: boolean})[]

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;

  before(async () => {
    dcProgram = await dcInit(
      provider,
      anchor.workspace.DataCredits.programId,
      anchor.workspace.DataCredits.idl
    );
    cbProgram = await cbInit(
      provider,
      anchor.workspace.CircuitBreaker.programId,
      anchor.workspace.CircuitBreaker.idl
    );
    ensureDCIdl(dcProgram);
    ensureHSDIdl(program);
    hemProgram = await issuerInit(
      provider,
      anchor.workspace.HeliumEntityManager.programId,
      anchor.workspace.HeliumEntityManager.idl
    );

    vsrProgram = new Program<VoterStakeRegistry>(
      IDL as VoterStakeRegistry,
      VSR_PID,
      provider,
    );
  });

  it("initializes a dao", async () => {
    const { dao, mint } = await initTestDao(program, provider, EPOCH_REWARDS, provider.wallet.publicKey);
    const account = await program.account.daoV0.fetch(dao!);
    expect(account.authority.toBase58()).eq(me.toBase58());
    expect(account.hntMint.toBase58()).eq(mint.toBase58());
  });

  it("initializes a subdao", async () => {
    const { dao } = await initTestDao(program, provider, EPOCH_REWARDS, provider.wallet.publicKey);
    const { subDao, treasury, mint, treasuryCircuitBreaker } =
      await initTestSubdao(
        program,
        provider,
        provider.wallet.publicKey,
        dao,
      );

    const account = await program.account.subDaoV0.fetch(subDao!);
    const breaker = await cbProgram.account.accountWindowedCircuitBreakerV0.fetch(treasuryCircuitBreaker);

    // @ts-ignore
    expect(Boolean(breaker.config.thresholdType.absolute)).to.be.true;

    expect(account.authority.toBase58()).eq(me.toBase58());
    expect(account.treasury.toBase58()).eq(treasury.toBase58());
    expect(account.dntMint.toBase58()).eq(mint.toBase58());
  });

  describe("with dao and subdao", () => {
    let dao: PublicKey;
    let subDao: PublicKey;
    let hotspotIssuer: PublicKey;
    let treasury: PublicKey;
    let dcMint: PublicKey;
    let rewardsEscrow: PublicKey;
    let stakerPool: PublicKey;
    let makerKeypair: Keypair;

    async function burnDc(
      amount: number
    ): Promise<{ subDaoEpochInfo: PublicKey }> {
      await dcProgram.methods
        .mintDataCreditsV0({
          hntAmount: toBN(amount, 8),
        })
        .accounts({ dcMint })
        .rpc({ skipPreflight: true });

      await sendInstructions(provider, [
        SystemProgram.transfer({
          fromPubkey: me,
          toPubkey: PublicKey.findProgramAddressSync(
            [Buffer.from("account_payer", "utf8")],
            dcProgram.programId
          )[0],
          lamports: 100000000,
        }),
      ]);

      return burnDataCredits({
        program: dcProgram,
        subDao,
        amount,
      });
    }

    beforeEach(async () => {
      ({
        dataCredits: { dcMint },
        subDao: { subDao, treasury, rewardsEscrow, stakerPool },
        dao: { dao },
        issuer: { makerKeypair, hotspotIssuer },
      } = await initWorld(
        provider,
        hemProgram,
        program,
        dcProgram,
        EPOCH_REWARDS,
        SUB_DAO_EPOCH_REWARDS
      ));

    });

    it("allows tracking dc spend", async () => {
      const { subDaoEpochInfo } = await burnDc(10);

      const epochInfo = await program.account.subDaoEpochInfoV0.fetch(
        subDaoEpochInfo
      );
      
      expect(epochInfo.dcBurned.toNumber()).eq(toBN(10, 0).toNumber());
    });

    const vehntOptions = [
      { name: "Case 1", options: {delay: 0, lockupPeriods: 183, lockupAmount: 100, stakeAmount: 100} },
      { name: "Case 2", options: {delay: 15000, lockupPeriods: 183*4, lockupAmount: 50, stakeAmount: 1} },
      // { name: "Case 3", options: {delay: 45000, lockupPeriods: 183*8, lockupAmount: 100, stakeAmount: 10000} },
      // { name: "Case 4", options: {delay: 5000, lockupPeriods: 183*8, lockupAmount: 1000, stakeAmount: 10000} },
    ]

    vehntOptions.forEach(function ({name, options}) {
      describe("vehnt tests - " + name, () => {
        beforeEach(async() => {
          remainingAccounts = [
            {
              pubkey: subDao,
              isWritable: true,
              isSigner: false,
            },
            {
              pubkey: PublicKey.default,
              isWritable: false,
              isSigner: false,
            },
            {
              pubkey: PublicKey.default,
              isWritable: false,
              isSigner: false,
            },
            {
              pubkey: PublicKey.default,
              isWritable: false,
              isSigner: false,
            },
            {
              pubkey: PublicKey.default,
              isWritable: false,
              isSigner: false,
            }
          ]
    
          voterKp = Keypair.generate();
          ({registrar, voter, vault, hntMint} = await initVsr(vsrProgram, provider, me, voterKp, options ));
          const stakePosition = stakePositionKey(voterKp.publicKey, 0)[0];
          thread = PublicKey.findProgramAddressSync([
            Buffer.from("thread", "utf8"), stakePosition.toBuffer(), Buffer.from(`purge-${0}`, "utf8")
          ], THREAD_PID)[0];
        })

        it("allows vehnt staking", async () => {
          const stakePosition = stakePositionKey(voterKp.publicKey, 0)[0];
          const vehntStake = toBN(options.stakeAmount,8);
          await program.methods.stakeV0({
            vehntAmount: vehntStake,
            depositEntryIdx: 0,
            percentages: [100, 0, 0, 0, 0],
          }).accounts({
            registrar,
            subDao,
            voterAuthority: voterKp.publicKey,
            vsrProgram: VSR_PID,
            stakePosition,
            thread,
            clockwork: THREAD_PID,
          }).remainingAccounts(remainingAccounts).signers([voterKp]).rpc();

          const acc = await program.account.stakePositionV0.fetch(stakePosition);
          const sdAcc = await program.account.subDaoV0.fetch(subDao);
          expectBnAccuracy(vehntStake, sdAcc.vehntStaked, 0.001);
          expectBnAccuracy(vehntStake, acc.hntAmount, 0.001);
          assert.isTrue(acc.fallRate.gt(new anchor.BN(0)))
          assert.isTrue(!!(await provider.connection.getAccountInfo(thread)));
        });
    
        function expectBnAccuracy(expectedBn: anchor.BN, actualBn: anchor.BN, percentUncertainty: number) {
          const upper = expectedBn.mul(new BN(1 + percentUncertainty));
          const lower = expectedBn.mul(new BN(1 - percentUncertainty));
          expect(actualBn.gte(lower));
          expect(actualBn.lte(upper));
        }
    
        it("calculates subdao rewards", async () => {
          const { subDaoEpochInfo } = await burnDc(1600000);
            const epoch = (
                await program.account.subDaoEpochInfoV0.fetch(subDaoEpochInfo)
            ).epoch;

          
          // stake some vehnt
          const stakePosition = stakePositionKey(voterKp.publicKey, 0)[0];
          await program.methods.stakeV0({
            vehntAmount: toBN(15, 8),
            depositEntryIdx: 0,
            percentages: [100, 0, 0, 0, 0],
          }).accounts({
            registrar,
            subDao,
            voterAuthority: voterKp.publicKey,
            vsrProgram: VSR_PID,
            stakePosition,
            thread,
            clockwork: THREAD_PID,
          }).remainingAccounts(remainingAccounts).signers([voterKp]).rpc({skipPreflight: true});
          
          const instr = program.methods
            .calculateUtilityScoreV0({
              epoch,
            })
            .preInstructions([
              ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
            ])
            .accounts({
              subDao,
              dao,
            });

          const pubkeys = await instr.pubkeys();
          const sig = await instr.rpc({ skipPreflight: true, commitment: "confirmed" });
          const resp = await provider.connection.getTransaction(sig, { commitment: "confirmed" });
          
          const currentActiveDeviceCount = Number(resp?.meta?.logMessages
            ?.find((m) => m.includes("Total devices"))
            ?.replace("Program log: Total devices: ", "")
            .split(".")[0]!);
          console.log(currentActiveDeviceCount);

          const subDaoInfo = await program.account.subDaoEpochInfoV0.fetch(
            subDaoEpochInfo
          );
          const daoInfo = await program.account.daoEpochInfoV0.fetch(
            pubkeys.daoEpochInfo!
          );

          expect(daoInfo.numUtilityScoresCalculated).to.eq(1);

          // 4 dc burned, activation fee of 50, 15 vehnt staked
          // sqrt(1 * 50) * (16)^1/4 * 15 = 212.13203435596426 = 21_213_203_435_596_426
          const totalUtility = Math.sqrt(currentActiveDeviceCount * 50) * Math.pow(16, 1/4) * 15;
          const utility = twelveDecimalsToNumber(daoInfo.totalUtilityScore);

          expect(utility).to.eq(totalUtility);
          expect(twelveDecimalsToNumber(subDaoInfo.utilityScore!)).to.eq(
            totalUtility
          );

          expectBnAccuracy(new BN(totalUtility), daoInfo.totalUtilityScore, 0.01);
          expectBnAccuracy(new BN(totalUtility), subDaoInfo.utilityScore!, 0.01);
        });
    
        describe("with staked vehnt", () => {
          let stakePosition: PublicKey;
          beforeEach(async() => {
            stakePosition = stakePositionKey(voterKp.publicKey, 0)[0];
            await program.methods.stakeV0({
              vehntAmount: toBN(options.stakeAmount, 8),
              depositEntryIdx: 0,
              percentages: [100, 0, 0, 0, 0],
            }).accounts({
              registrar,
              subDao,
              voterAuthority: voterKp.publicKey,
              vsrProgram: VSR_PID,
              stakePosition,
              thread,
              clockwork: THREAD_PID,
            }).remainingAccounts(remainingAccounts).signers([voterKp]).rpc({skipPreflight: true});
          })
    
          it("allows closing stake", async () => {
            await sleep(options.delay);
            await program.methods.closeStakeV0({
              depositEntryIdx: 0,
            }).accounts({
              registrar,
              stakePosition,
              voterAuthority: voterKp.publicKey,
              vsrProgram: VSR_PID,
              thread,
              clockwork: THREAD_PID,
            }).remainingAccounts(remainingAccounts).signers([voterKp]).rpc({skipPreflight: true});
    
            const sdAcc = await program.account.subDaoV0.fetch(subDao);
            let st = sdAcc.vehntStaked.toNumber();
            assert.equal(sdAcc.vehntFallRate.toNumber(), 0);
            assert.isTrue(st == 0 || st == 1)
            assert.isFalse(!!(await provider.connection.getAccountInfo(stakePosition)));
          });
    
          it("purge a position", async () => {
            await program.methods.purgePositionV0().accounts({
              registrar,
              stakePosition,
              voterAuthority: voterKp.publicKey,
              vsrProgram: VSR_PID,
              thread,
              clockwork: THREAD_PID,
            }).remainingAccounts(remainingAccounts).signers([voterKp]).rpc();
    
            let acc = await program.account.stakePositionV0.fetch(stakePosition);
            assert.isTrue(acc.purged);
            let subDaoAcc = await program.account.subDaoV0.fetch(subDao);
            assert.equal(subDaoAcc.vehntFallRate.toNumber(), 0);
          });
    
          it("refreshes a position", async () => {
            await vsrProgram.methods.createDepositEntry(1, {cliff: {}}, null, options.lockupPeriods, false).accounts({ // lock for 6 months
              registrar,
              voter,
              vault,
              depositMint: hntMint,
              voterAuthority: voterKp.publicKey,
              payer: voterKp.publicKey,
            }).signers([voterKp]).rpc({skipPreflight: true});
            await vsrProgram.methods.internalTransferLocked(0, 1, toBN(options.lockupAmount, 8)).accounts({
              registrar,
              voter,
              voterAuthority: voterKp.publicKey,
            }).signers([voterKp]).rpc({skipPreflight: true});
    
            await program.methods.refreshPositionV0({
              depositEntryIdx: 0,
            }).accounts({
              registrar,
              stakePosition,
              voterAuthority: voterKp.publicKey,
              vsrProgram: VSR_PID,
            }).remainingAccounts(remainingAccounts).signers([voterKp]).rpc();
    
            const acc = await program.account.stakePositionV0.fetch(stakePosition);
            assert.equal(acc.hntAmount.toNumber(), 0);
            assert.equal(acc.fallRate.toNumber(), 0);
            const subDaoAcc = await program.account.subDaoV0.fetch(subDao);
            assert.isTrue(subDaoAcc.vehntStaked.toNumber() == 0 || subDaoAcc.vehntStaked.toNumber() == 1);
            assert.equal(subDaoAcc.vehntFallRate.toNumber(), 0);
    
          });
    
          it("updates vehnt stake", async () => {
            const stakePosition = stakePositionKey(voterKp.publicKey, 0)[0];
      
            await program.methods.stakeV0({
              vehntAmount: toBN(2, 8),
              depositEntryIdx: 0,
              percentages: [100, 0, 0, 0, 0],
            }).accounts({
              registrar,
              subDao,
              voterAuthority: voterKp.publicKey,
              vsrProgram: VSR_PID,
              stakePosition,
              thread,
              clockwork: THREAD_PID,
            }).remainingAccounts(remainingAccounts).signers([voterKp]).rpc({skipPreflight: true});
      
            const acc = await program.account.stakePositionV0.fetch(stakePosition);
            const sdAcc = await program.account.subDaoV0.fetch(subDao);
            expectBnAccuracy(toBN(2, 8), sdAcc.vehntStaked, 0.01);
            expectBnAccuracy(acc.hntAmount, toBN(2,8), 0.001);
            assert.isTrue(acc.fallRate.gt(new BN(0)));

    
            await program.methods.stakeV0({
              vehntAmount: toBN(1, 8),
              depositEntryIdx: 0,
              percentages: [100, 0, 0, 0, 0],
            }).accounts({
              registrar,
              subDao,
              voterAuthority: voterKp.publicKey,
              vsrProgram: VSR_PID,
              stakePosition,
              thread,
              clockwork: THREAD_PID,
            }).remainingAccounts(remainingAccounts).signers([voterKp]).rpc({skipPreflight: true});
      
            const acc2 = await program.account.stakePositionV0.fetch(stakePosition);
            const sdAcc2 = await program.account.subDaoV0.fetch(subDao);
            expectBnAccuracy(toBN(1, 8), sdAcc2.vehntStaked, 0.01);
            expectBnAccuracy(acc2.hntAmount, toBN(1,8), 0.001);
            assert.isTrue(acc2.fallRate.gt(new BN(0)));
            assert.isTrue(acc2.fallRate.lt(acc.fallRate));
          });
    
          describe("with calculated rewards", () => {
            let epoch: anchor.BN;
      
            beforeEach(async () => {
              const { subDaoEpochInfo } = await burnDc(1600000);
              epoch = (await program.account.subDaoEpochInfoV0.fetch(subDaoEpochInfo))
                .epoch;
              await program.methods
                .calculateUtilityScoreV0({
                  epoch,
                })
                .preInstructions([
                  ComputeBudgetProgram.setComputeUnitLimit({ units: 350000 }),
                ])
                .accounts({
                  subDao,
                  dao,
                })
                .rpc({ skipPreflight: true });
            });
      
            it("issues hnt rewards to subdaos and dnt to rewards escrow", async () => {
              const preBalance = AccountLayout.decode(
                (await provider.connection.getAccountInfo(treasury))?.data!
              ).amount;
              const preMobileBalance = AccountLayout.decode(
                (await provider.connection.getAccountInfo(rewardsEscrow))?.data!
              ).amount;
              await sendInstructions(provider, [
                await program.methods
                  .issueRewardsV0({
                    epoch,
                  })
                  .accounts({
                    subDao,
                  })
                  .instruction(),
              ]);
      
              const postBalance = AccountLayout.decode(
                (await provider.connection.getAccountInfo(treasury))?.data!
              ).amount;
              const postMobileBalance = AccountLayout.decode(
                (await provider.connection.getAccountInfo(rewardsEscrow))?.data!
              ).amount;
              expect((postBalance - preBalance).toString()).to.eq(
                EPOCH_REWARDS.toString()
              );
              expect(((postMobileBalance - preMobileBalance)).toString()).to.eq(
                ((SUB_DAO_EPOCH_REWARDS / 100) * 94).toString()
              );
    
              const acc = await program.account.subDaoEpochInfoV0.fetch(subDaoEpochInfo);
              expect(acc.rewardsIssued).to.be.true;
            });
      
            it("claim rewards", async () => {
              // issue rewards
              await sendInstructions(provider, [
                await program.methods
                  .issueRewardsV0({
                    epoch,
                  })
                  .accounts({
                    subDao,
                  })
                  .instruction(),
              ]);
    
              const method = program.methods.claimRewardsV0({
                depositEntryIdx: 0,
                epoch,
              }).accounts({
                registrar,
                stakePosition,
                subDao,
                voterAuthority: voterKp.publicKey,
                vsrProgram: VSR_PID,
              }).signers([voterKp]);
              const { stakerAta } = await method.pubkeys();
              await method.rpc({skipPreflight: true});
              
              const postAtaBalance = AccountLayout.decode(
                (await provider.connection.getAccountInfo(stakerAta!))?.data!
              ).amount;
              assert.isTrue(postAtaBalance <= BigInt(SUB_DAO_EPOCH_REWARDS*6 / 100));
              assert.isTrue(postAtaBalance > BigInt(SUB_DAO_EPOCH_REWARDS*6 / 100 - 5));
    
            });
          });
        })
      })
    })
  });
});
function twelveDecimalsToNumber(totalUtilityScore: anchor.BN) {
  const utilityStr = totalUtilityScore.toString()
  // format utility with 12 decimals
  const utility = Number(
    `${utilityStr.slice(0, utilityStr.length - 12)}.${utilityStr.slice(
      utilityStr.length - 12,
      utilityStr.length
    )}`
  );
  return utility;
}

