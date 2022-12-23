import { init as cbInit } from "@helium/circuit-breaker-sdk";
import { CircuitBreaker } from "@helium/idls/lib/types/circuit_breaker";
import { VoterStakeRegistry } from "@helium/idls/lib/types/voter_stake_registry";
import { HeliumSubDaos } from "@helium/idls/lib/types/helium_sub_daos";
import { sendInstructions, toBN } from "@helium/spl-utils";
import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { AccountLayout } from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram
} from "@solana/web3.js";
import { BN } from "bn.js";
import { assert, expect } from "chai";
import { init as vsrInit } from "../packages/voter-stake-registry-sdk/src";
import { init as dcInit } from "../packages/data-credits-sdk/src";
import { init as issuerInit } from "../packages/helium-entity-manager-sdk/src";
import { heliumSubDaosResolvers, stakePositionKey } from "../packages/helium-sub-daos-sdk/src";
import { DataCredits } from "../target/types/data_credits";
import { HeliumEntityManager } from "../target/types/helium_entity_manager";
import { burnDataCredits } from "./data-credits";
import { initTestDao, initTestSubdao } from "./utils/daos";
import { ensureDCIdl, ensureHSDIdl, ensureVSRIdl, initWorld } from "./utils/fixtures";
import { initVsr } from "./utils/vsr";

const THREAD_PID = new PublicKey("3XXuUFfweXBwFgFfYaejLvZE4cGZiHgKiGfMtdxNzYmv");

const EPOCH_REWARDS = 100000000;
const SUB_DAO_EPOCH_REWARDS = 10000000;

function sleep(ms: number) {
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
  let position: PublicKey;
  let vault: PublicKey;
  let hntMint: PublicKey;
  let positionAuthorityKp: Keypair;

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

    vsrProgram = await vsrInit(
      provider,
      anchor.workspace.VoterStakeRegistry.programId,
      anchor.workspace.VoterStakeRegistry.idl
    );
    ensureVSRIdl(vsrProgram);
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
    let treasury: PublicKey;
    let dcMint: PublicKey;
    let rewardsEscrow: PublicKey;

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
        dataCredits: { dcMint, hntMint },
        subDao: { subDao, treasury, rewardsEscrow },
        dao: { dao },
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
      {
        name: "Case 1",
        options: {
          delay: 1000,
          lockupPeriods: 183,
          lockupAmount: 100,
          expectedMultiplier: 1
        },
      },
      {
        name: "Case 2",
        options: {
          delay: 15000,
          lockupPeriods: 183 * 4,
          lockupAmount: 50,
          expectedMultiplier: 1 + ((183 * 4 - 183) / (365 * 4 - 183)) * 99
        },
      },
      // { name: "Case 3", options: {delay: 45000, lockupPeriods: 183*8, lockupAmount: 100, stakeAmount: 10000} },
      // { name: "Case 4", options: {delay: 5000, lockupPeriods: 183*8, lockupAmount: 1000, stakeAmount: 10000} },
    ];

    vehntOptions.forEach(function ({name, options}) {
      describe("vehnt tests - " + name, () => {
        beforeEach(async() => {
          positionAuthorityKp = Keypair.generate();
          ({registrar, position, vault} = await initVsr(vsrProgram, provider, me, hntMint, positionAuthorityKp, options ));
        })

        it("allows vehnt staking", async () => {
          const lockupAmount = toBN(options.lockupAmount,8);
          const method = program.methods
            .stakeV0()
            .accounts({
              position,
              subDao,
              positionAuthority: positionAuthorityKp.publicKey,
            })
            .signers([positionAuthorityKp]);
          const { stakePosition, thread } = await method.pubkeys();
          await method.rpc();

          const acc = await program.account.stakePositionV0.fetch(stakePosition!);
          const sdAcc = await program.account.subDaoV0.fetch(subDao);

          expectBnAccuracy(
            toBN(options.lockupAmount * options.expectedMultiplier, 8),
            sdAcc.vehntStaked,
            0.001
          );
          expectBnAccuracy(lockupAmount, acc.hntAmount, 0.001);
          assert.isTrue(acc.fallRate.gt(new anchor.BN(0)))
          assert.isTrue(!!(await provider.connection.getAccountInfo(thread!)));
        });
    
        function expectBnAccuracy(
          expectedBn: anchor.BN,
          actualBn: anchor.BN,
          percentUncertainty: number
        ) {
          let upperBound = expectedBn.mul(new BN(1 + percentUncertainty));
          let lowerBound = expectedBn.mul(new BN(1 - percentUncertainty));
          try {
            expect(upperBound.gte(actualBn)).to.be.true;
            expect(lowerBound.lte(actualBn)).to.be.true;
          } catch (e) {
            console.error(
              "Expected",
              expectedBn.toString(),
              "Actual",
              actualBn.toString()
            );
            throw e;
          }
        }
    
        it("calculates subdao rewards", async () => {
          const { subDaoEpochInfo } = await burnDc(1600000);
            const epoch = (
                await program.account.subDaoEpochInfoV0.fetch(subDaoEpochInfo)
            ).epoch;

          
          // stake some vehnt
          await program.methods.stakeV0().accounts({
            position,
            subDao,
            positionAuthority: positionAuthorityKp.publicKey,
          }).signers([positionAuthorityKp]).rpc({skipPreflight: true});
          
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

          const totalUtility = Math.sqrt(currentActiveDeviceCount * 50) * Math.pow(16, 1/4) * (options.lockupAmount * options.expectedMultiplier);

          expectBnAccuracy(toBN(totalUtility, 12), daoInfo.totalUtilityScore, 0.01);
          expectBnAccuracy(toBN(totalUtility, 12), subDaoInfo.utilityScore!, 0.01);
        });
    
        describe("with staked vehnt", () => {
          beforeEach(async() => {
            await program.methods
              .stakeV0()
              .accounts({
                position,
                subDao,
                positionAuthority: positionAuthorityKp.publicKey,
              })
              .signers([positionAuthorityKp])
              .rpc({ skipPreflight: true });
          })
    
          it("allows closing stake", async () => {
            await sleep(options.delay);
            const method = program.methods
              .closeStakeV0()
              .accounts({
                position,
                subDao,
                positionAuthority: positionAuthorityKp.publicKey,
              })
              .signers([positionAuthorityKp]);

            const { stakePosition } = await method.pubkeys();
            await method.rpc({skipPreflight: true});
    
            const sdAcc = await program.account.subDaoV0.fetch(subDao);
            let st = sdAcc.vehntStaked.toNumber();
            expect(sdAcc.vehntFallRate.toNumber()).to.eq(0);
            assert.isTrue(st == 0 || st == 1)
            assert.isFalse(!!(await provider.connection.getAccountInfo(stakePosition!)));
          });
    
          it("purge a position", async () => {
            const method = program.methods
              .purgePositionV0()
              .accounts({
                position,
                subDao,
              })
            await method.rpc();
            const { stakePosition } = await method.pubkeys();
    
            let acc = await program.account.stakePositionV0.fetch(stakePosition!);
            assert.isTrue(acc.purged);
            let subDaoAcc = await program.account.subDaoV0.fetch(subDao);
            assert.equal(subDaoAcc.vehntFallRate.toNumber(), 0);
          });
    
          it("refreshes a position", async () => {
            await vsrProgram.methods.depositV0({
              amount: toBN(options.lockupAmount, 8)
            }).accounts({
              registrar,
              position,
              mint: hntMint
            }).rpc({skipPreflight: true});
    
            const {
              pubkeys: { stakePosition },
            } = await program.methods
              .refreshPositionV0()
              .accounts({
                registrar,
                subDao,
                position
              })
              .rpcAndKeys({ skipPreflight: true });

            const acc = await program.account.stakePositionV0.fetch(
              stakePosition!
            );
            expect(acc.hntAmount.toNumber()).to.eq(
              toBN(options.lockupAmount * 2, 8).toNumber()
            );
            expect(acc.fallRate.toNumber()).to.be.gt(0);
            const subDaoAcc = await program.account.subDaoV0.fetch(subDao);
            expectBnAccuracy(
              toBN(options.lockupAmount * 2 * options.expectedMultiplier, 8),
              subDaoAcc.vehntStaked,
              0.01
            );
            expect(subDaoAcc.vehntFallRate.toNumber()).to.be.gt(0);
          });
          
          describe("with calculated rewards", () => {
            let epoch: anchor.BN;
            let subDaoEpochInfo: PublicKey;
      
            beforeEach(async () => {
              ({ subDaoEpochInfo } = await burnDc(1600000));
              epoch = (await program.account.subDaoEpochInfoV0.fetch(subDaoEpochInfo))
                .epoch;

              const thread = PublicKey.findProgramAddressSync([
                Buffer.from("thread", "utf8"), subDao.toBuffer(), Buffer.from("end-epoch", "utf8")
              ], THREAD_PID)[0];

              await program.methods
                .calculateUtilityScoreV0({
                  epoch,
                })
                .preInstructions([
                  ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
                ])
                .accounts({
                  subDao,
                  dao,
                  thread,
                  clockwork: THREAD_PID,
                }).rpc({skipPreflight: true});
              
            });
      
            it("issues hnt rewards to subdaos and dnt to rewards escrow", async () => {
              const preBalance = AccountLayout.decode(
                (await provider.connection.getAccountInfo(treasury))?.data!
              ).amount;
              const preMobileBalance = AccountLayout.decode(
                (await provider.connection.getAccountInfo(rewardsEscrow))?.data!
              ).amount;
              await program.methods
                  .issueRewardsV0({
                    epoch,
                  })
                  .accounts({
                    subDao,
                  })
                  .rpc({skipPreflight: true})
      
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
              expect(Boolean(acc.rewardsIssuedAt)).to.be.true;
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
                epoch,
              }).accounts({
                position,
                subDao,
                positionAuthority: positionAuthorityKp.publicKey,
              }).signers([positionAuthorityKp]);
              const { stakerAta } = await method.pubkeys();
              await method.rpc({skipPreflight: true});
              
              const postAtaBalance = AccountLayout.decode(
                (await provider.connection.getAccountInfo(stakerAta!))?.data!
              ).amount;
              expect(Number(postAtaBalance)).to.be.within(SUB_DAO_EPOCH_REWARDS*6 / 100 - 5, SUB_DAO_EPOCH_REWARDS*6 / 100)    
            });
          });
        })
      })
    })
  });
});

