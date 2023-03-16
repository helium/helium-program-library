import { init as cbInit } from "@helium/circuit-breaker-sdk";
import { daoKey, EPOCH_LENGTH } from "@helium/helium-sub-daos-sdk";
import { CircuitBreaker } from "@helium/idls/lib/types/circuit_breaker";
import { HeliumSubDaos } from "@helium/idls/lib/types/helium_sub_daos";
import { VoterStakeRegistry } from "@helium/idls/lib/types/voter_stake_registry";
import {
  createAtaAndMint,
  createAtaAndTransfer,
  createMint,
  roundToDecimals,
  sendInstructions,
  toBN,
  toNumber,
} from "@helium/spl-utils";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AccountLayout, getMint } from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { BN } from "bn.js";
import chai, { assert, expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import { init as dcInit } from "../packages/data-credits-sdk/src";
import { init as issuerInit } from "../packages/helium-entity-manager-sdk/src";
import {
  currentEpoch,
  heliumSubDaosResolvers,
  subDaoEpochInfoKey,
} from "../packages/helium-sub-daos-sdk/src";
import { init as vsrInit } from "../packages/voter-stake-registry-sdk/src";
import { DataCredits } from "../target/types/data_credits";
import { HeliumEntityManager } from "../target/types/helium_entity_manager";
import { burnDataCredits } from "./data-credits";
import { initTestDao, initTestSubdao } from "./utils/daos";
import {
  ensureDCIdl,
  ensureHSDIdl,
  ensureVSRIdl,
  initWorld,
} from "./utils/fixtures";
import { getUnixTimestamp } from "./utils/solana";
import { createPosition, initVsr } from "./utils/vsr";
import { expectBnAccuracy } from "./utils/expectBnAccuracy";

chai.use(chaiAsPromised);

const THREAD_PID = new PublicKey(
  "CLoCKyJ6DXBJqqu2VWx9RLbgnwwR6BMHHuyasVmfMzBh"
);

const EPOCH_REWARDS = 100000000;
const SUB_DAO_EPOCH_REWARDS = 10000000;
const SECS_PER_DAY = 86400;
const SECS_PER_YEAR = 365 * SECS_PER_DAY;
const MAX_LOCKUP = 4 * SECS_PER_YEAR;
const SCALE = 100;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    const { dao, mint } = await initTestDao(
      program,
      provider,
      EPOCH_REWARDS,
      provider.wallet.publicKey
    );
    const account = await program.account.daoV0.fetch(dao!);
    expect(account.authority.toBase58()).eq(me.toBase58());
    expect(account.hntMint.toBase58()).eq(mint.toBase58());
  });

  it("initializes a subdao", async () => {
    const { dao } = await initTestDao(
      program,
      provider,
      EPOCH_REWARDS,
      provider.wallet.publicKey
    );
    const { subDao, treasury, mint, treasuryCircuitBreaker } =
      await initTestSubdao(program, provider, provider.wallet.publicKey, dao);

    const account = await program.account.subDaoV0.fetch(subDao!);
    const breaker =
      await cbProgram.account.accountWindowedCircuitBreakerV0.fetch(
        treasuryCircuitBreaker
      );

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
    let hstPool: PublicKey;
    let dcMint: PublicKey;
    let rewardsEscrow: PublicKey;
    let genesisVotePowerMultiplierExpirationTs = 1;
    let initialSupply = toBN(223_000_000, 8);

    async function burnDc(
      amount: number
    ): Promise<{ subDaoEpochInfo: PublicKey }> {
      await dcProgram.methods
        .mintDataCreditsV0({
          hntAmount: toBN(amount, 8),
          dcAmount: null,
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
      positionAuthorityKp = Keypair.generate();
      hntMint = await createMint(provider, 8, me, me);
      await createAtaAndMint(provider, hntMint, initialSupply);
      await createAtaAndTransfer(
        provider,
        hntMint,
        toBN(1000, 8),
        me,
        positionAuthorityKp.publicKey
      );
      await provider.connection.requestAirdrop(
        positionAuthorityKp.publicKey,
        LAMPORTS_PER_SOL
      );
      console.log(`Genesis: ${genesisVotePowerMultiplierExpirationTs}`);

      ({ registrar } = await initVsr(
        vsrProgram,
        provider,
        me,
        hntMint,
        daoKey(hntMint)[0],
        genesisVotePowerMultiplierExpirationTs,
        3
      ));
      ({
        dataCredits: { dcMint },
        subDao: { subDao, treasury, rewardsEscrow },
        dao: { dao },
      } = await initWorld(
        provider,
        hemProgram,
        program,
        dcProgram,
        EPOCH_REWARDS,
        SUB_DAO_EPOCH_REWARDS,
        registrar,
        hntMint
      ));
      hstPool = (await program.account.daoV0.fetch(dao)).hstPool;
    });

    it("updates the dao", async () => {
      const newAuth = Keypair.generate().publicKey;
      await program.methods
        .updateDaoV0({
          authority: newAuth,
          emissionSchedule: null,
          hstEmissionSchedule: null,
        })
        .accounts({
          dao,
        })
        .rpc({ skipPreflight: true });

      const daoAcc = await program.account.daoV0.fetch(dao);
      expect(daoAcc.authority.toString()).to.eq(newAuth.toString());
    });

    it("updates the subdao", async () => {
      const newAuth = Keypair.generate().publicKey;
      await program.methods
        .updateSubDaoV0({
          authority: newAuth,
          dcBurnAuthority: null,
          emissionSchedule: null,
          onboardingDcFee: null,
          activeDeviceAggregator: null,
          registrar: null,
        })
        .accounts({
          subDao,
        })
        .rpc({ skipPreflight: true });

      const subDaoAcc = await program.account.subDaoV0.fetch(subDao);
      expect(subDaoAcc.authority.toString()).to.eq(newAuth.toString());
    });

    it("resets the subdao clockwork thread", async () => {
      await program.methods
        .resetSubDaoThreadV0()
        .accounts({
          subDao,
        })
        .rpc({ skipPreflight: true });
    });

    it("resets the dao clockwork thread", async () => {
      await program.methods
        .resetDaoThreadV0()
        .accounts({
          dao,
        })
        .rpc({ skipPreflight: true });
    });

    it("allows tracking dc spend", async () => {
      const { subDaoEpochInfo } = await burnDc(10);

      const epochInfo = await program.account.subDaoEpochInfoV0.fetch(
        subDaoEpochInfo
      );

      expect(epochInfo.dcBurned.toNumber()).eq(toBN(10, 0).toNumber());
    });

    describe("with position", () => {
      before(() => {
        genesisVotePowerMultiplierExpirationTs = 1;
      });

      beforeEach(async () => {
        ({ position, vault } = await createPosition(
          vsrProgram,
          provider,
          registrar,
          hntMint,
          { lockupPeriods: 1, lockupAmount: 100 },
          positionAuthorityKp
        ));
      });

      it("updates the subdao vehnt to 0 when the final epoch passes", async () => {
        const epoch = currentEpoch(
          new BN(Number(await getUnixTimestamp(provider)))
        );

        await vsrProgram.methods
          .setTimeOffsetV0(new BN(1 * 60 * 60 * 24))
          .accounts({ registrar })
          .rpc({ skipPreflight: true });
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
          })
          .rpc({ skipPreflight: true });

        const subDaoAccount = await program.account.subDaoV0.fetch(subDao);
        expect(subDaoAccount.vehntDelegated.toNumber()).eq(0);
      });
    });

    const vehntOptions = [
      {
        name: "Case 1",
        options: {
          delay: 1000,
          lockupPeriods: 183,
          lockupAmount: 100,
          expectedMultiplier:
            Math.min((SECS_PER_DAY * 183) / MAX_LOCKUP, 1) * SCALE,
        },
      },
      {
        name: "Case 2",
        options: {
          delay: 15000,
          lockupPeriods: 183 * 4,
          lockupAmount: 50,
          expectedMultiplier:
            Math.min((SECS_PER_DAY * 183 * 4) / MAX_LOCKUP, 1) * SCALE,
        },
      },
      // { name: "Case 3", options: {delay: 45000, lockupPeriods: 183*8, lockupAmount: 100, delegateAmount: 10000} },
      // { name: "Case 4", options: {delay: 5000, lockupPeriods: 183*8, lockupAmount: 1000, delegateAmount: 10000} },
    ];

    vehntOptions.forEach(function ({ name, options }) {
      describe("vehnt tests - " + name, () => {
        before(() => {
          genesisVotePowerMultiplierExpirationTs = 1;
        });
        beforeEach(async () => {
          ({ position, vault } = await createPosition(
            vsrProgram,
            provider,
            registrar,
            hntMint,
            options,
            positionAuthorityKp
          ));
        });

        it("allows vehnt delegation", async () => {
          const lockupAmount = toBN(options.lockupAmount, 8);
          const method = program.methods
            .delegateV0()
            .accounts({
              position,
              subDao,
              positionAuthority: positionAuthorityKp.publicKey,
            })
            .signers([positionAuthorityKp]);
          const { delegatedPosition } = await method.pubkeys();
          await method.rpc({ skipPreflight: true });

          const acc = await program.account.delegatedPositionV0.fetch(
            delegatedPosition!
          );
          const sdAcc = await program.account.subDaoV0.fetch(subDao);

          const expectedVeHnt =
            options.lockupAmount * options.expectedMultiplier;

          expectBnAccuracy(
            toBN(expectedVeHnt, 8).mul(new BN("1000000000000")),
            sdAcc.vehntDelegated,
            0.01
          );
          expectBnAccuracy(lockupAmount, acc.hntAmount, 0.001);
        });

        it("calculates subdao rewards", async () => {
          const { subDaoEpochInfo } = await burnDc(1600000);
          const epoch = (
            await program.account.subDaoEpochInfoV0.fetch(subDaoEpochInfo)
          ).epoch;

          // delegate some vehnt
          await program.methods
            .delegateV0()
            .accounts({
              position,
              subDao,
              positionAuthority: positionAuthorityKp.publicKey,
            })
            .signers([positionAuthorityKp])
            .rpc({ skipPreflight: true });

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
          const sig = await instr.rpc({
            skipPreflight: true,
            commitment: "confirmed",
          });
          const resp = await provider.connection.getTransaction(sig, {
            commitment: "confirmed",
          });

          const currentActiveDeviceCount = Number(
            resp?.meta?.logMessages
              ?.find((m) => m.includes("Total devices"))
              ?.replace("Program log: Total devices: ", "")
              .split(".")[0]!
          );

          const subDaoInfo = await program.account.subDaoEpochInfoV0.fetch(
            subDaoEpochInfo
          );
          const daoInfo = await program.account.daoEpochInfoV0.fetch(
            pubkeys.daoEpochInfo!
          );

          expect(daoInfo.numUtilityScoresCalculated).to.eq(1);

          const supply = (await getMint(provider.connection, hntMint)).supply;
          const veHnt = toNumber(subDaoInfo.vehntAtEpochStart, 8);
          const totalUtility =
            Math.max(veHnt, 1) * Math.pow(currentActiveDeviceCount * 50, 1 / 4) * Math.sqrt(16) * 1;
          expect(daoInfo.totalRewards.toString()).to.eq(
            EPOCH_REWARDS.toString()
          );
          expect(daoInfo.currentHntSupply.toString()).to.eq(
            new BN(supply.toString()).add(new BN(EPOCH_REWARDS)).toString()
          );

          console.log(totalUtility, veHnt, currentActiveDeviceCount);
          expectBnAccuracy(
            toBN(totalUtility, 12),
            daoInfo.totalUtilityScore,
            0.00000002
          );
          expectBnAccuracy(
            toBN(totalUtility, 12),
            subDaoInfo.utilityScore!,
            0.00000002
          );
        });

        it("allows transfers", async () => {
          const { position: newPos } = await createPosition(
            vsrProgram,
            provider,
            registrar,
            hntMint,
            options,
            positionAuthorityKp
          );
          await program.methods
            .transferV0({ amount: toBN(10, 8) })
            .accounts({
              sourcePosition: position,
              targetPosition: newPos,
              depositMint: hntMint,
              positionAuthority: positionAuthorityKp.publicKey,
            })
            .signers([positionAuthorityKp])
            .rpc();
        });

        it("allows lockup resets", async () => {
          await program.methods
            .resetLockupV0({
              kind: { constant: {} },
              periods: 182 * 8,
            })
            .accounts({
              dao,
              position: position,
              positionAuthority: positionAuthorityKp.publicKey,
            })
            .signers([positionAuthorityKp])
            .rpc();
        });

        describe("with delegated vehnt", () => {
          beforeEach(async () => {
            await program.methods
              .delegateV0()
              .accounts({
                position,
                subDao,
                positionAuthority: positionAuthorityKp.publicKey,
              })
              .signers([positionAuthorityKp])
              .rpc({ skipPreflight: true });
          });

          it("does not allow transfers", async () => {
            const { position: newPos } = await createPosition(
              vsrProgram,
              provider,
              registrar,
              hntMint,
              options,
              positionAuthorityKp
            );
            await expect(
              program.methods
                .transferV0({ amount: toBN(10, 8) })
                .accounts({
                  sourcePosition: position,
                  targetPosition: newPos,
                  depositMint: hntMint,
                  positionAuthority: positionAuthorityKp.publicKey,
                })
                .signers([positionAuthorityKp])
                .rpc()
            ).to.eventually.be.rejectedWith(
              "AnchorError caused by account: source_delegated_position. Error Code: PositionChangeWhileDelegated. Error Number: 6014. Error Message: Cannot change a position while it is delegated."
            );
          });

          it("does not allow lockup resets", async () => {
            await expect(
              program.methods
                .resetLockupV0({
                  kind: { constant: {} },
                  periods: 182 * 4,
                })
                .accounts({
                  dao,
                  position: position,
                  positionAuthority: positionAuthorityKp.publicKey,
                })
                .signers([positionAuthorityKp])
                .rpc()
            ).to.eventually.be.rejectedWith(
              "AnchorError caused by account: delegated_position. Error Code: PositionChangeWhileDelegated. Error Number: 6014. Error Message: Cannot change a position while it is delegated."
            );
          });

          it("allows closing delegate", async () => {
            await sleep(options.delay);
            const method = program.methods
              .closeDelegationV0()
              .accounts({
                position,
                subDao,
                positionAuthority: positionAuthorityKp.publicKey,
              })
              .signers([positionAuthorityKp]);

            const { delegatedPosition, subDaoEpochInfo } =
              await method.pubkeys();
            const sed = await program.account.subDaoEpochInfoV0.fetch(
              subDaoEpochInfo!
            );
            console.log(sed.fallRatesFromClosingPositions.toNumber());
            console.log(sed.vehntInClosingPositions.toNumber());
            await method.rpc({ skipPreflight: true });

            const sdAcc = await program.account.subDaoV0.fetch(subDao);
            let st = sdAcc.vehntDelegated.toNumber();
            expect(sdAcc.vehntFallRate.toNumber()).to.eq(0);
            expect(st).to.be.lte(1);
            assert.isFalse(
              !!(await provider.connection.getAccountInfo(delegatedPosition!))
            );
          });

          describe("with calculated rewards", () => {
            let epoch: anchor.BN;
            let subDaoEpochInfo: PublicKey;

            beforeEach(async () => {
              await vsrProgram.methods
                .setTimeOffsetV0(new BN(1 * 60 * 60 * 24))
                .accounts({ registrar })
                .rpc({ skipPreflight: true });

              ({ subDaoEpochInfo } = await burnDc(1600000));
              epoch = (
                await program.account.subDaoEpochInfoV0.fetch(subDaoEpochInfo)
              ).epoch;

              const thread = PublicKey.findProgramAddressSync(
                [
                  Buffer.from("thread", "utf8"),
                  subDao.toBuffer(),
                  Buffer.from("end-epoch", "utf8"),
                ],
                THREAD_PID
              )[0];

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
                })
                .rpc({ skipPreflight: true });
            });

            it("issues hnt rewards to subdaos, dnt to rewards escrow, and hst to hst pool", async () => {
              const preBalance = AccountLayout.decode(
                (await provider.connection.getAccountInfo(treasury))?.data!
              ).amount;
              const preHstBalance = AccountLayout.decode(
                (await provider.connection.getAccountInfo(hstPool))?.data!
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
                .rpc({ skipPreflight: true });

              await program.methods
                .issueHstPoolV0({
                  epoch,
                })
                .accounts({
                  dao,
                })
                .rpc({ skipPreflight: true });

              const postBalance = AccountLayout.decode(
                (await provider.connection.getAccountInfo(treasury))?.data!
              ).amount;
              const postMobileBalance = AccountLayout.decode(
                (await provider.connection.getAccountInfo(rewardsEscrow))?.data!
              ).amount;
              const postHstBalance = AccountLayout.decode(
                (await provider.connection.getAccountInfo(hstPool))?.data!
              ).amount;
              expect((postBalance - preBalance).toString()).to.eq(
                ((1 - 0.32) * EPOCH_REWARDS).toString()
              );
              expect((postHstBalance - preHstBalance).toString()).to.eq(
                (0.32 * EPOCH_REWARDS).toString()
              );
              expect((postMobileBalance - preMobileBalance).toString()).to.eq(
                ((SUB_DAO_EPOCH_REWARDS / 100) * 94).toString()
              );

              const acc = await program.account.subDaoEpochInfoV0.fetch(
                subDaoEpochInfo
              );
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

              const method = program.methods
                .claimRewardsV0({
                  epoch,
                })
                .accounts({
                  position,
                  subDao,
                  positionAuthority: positionAuthorityKp.publicKey,
                })
                .signers([positionAuthorityKp]);
              const { delegatorAta } = await method.pubkeys();
              await method.rpc({ skipPreflight: true });

              const postAtaBalance = AccountLayout.decode(
                (await provider.connection.getAccountInfo(delegatorAta!))?.data!
              ).amount;
              expect(Number(postAtaBalance)).to.be.within(
                (SUB_DAO_EPOCH_REWARDS * 6) / 100 - 5,
                (SUB_DAO_EPOCH_REWARDS * 6) / 100
              );
            });
          });
        });
      });
    });

    describe("with genesis config", () => {
      before(async () => {
        const currTs = Number(await getUnixTimestamp(provider));
        genesisVotePowerMultiplierExpirationTs = currTs + 60 * 60 * 24 * 7; // 7 days from now
      });

      it("correctly adjusts total vehnt at epoch start with changing genesis positions", async () => {
        ({ position, vault } = await createPosition(
          vsrProgram,
          provider,
          registrar,
          hntMint,
          // max lockup
          {
            lockupPeriods: 1464,
            lockupAmount: 100,
            kind: { constant: {} },
          },
          positionAuthorityKp
        ));
        program.methods
          .delegateV0()
          .accounts({
            position,
            subDao,
            positionAuthority: positionAuthorityKp.publicKey,
          })
          .signers([positionAuthorityKp])
          .rpc({ skipPreflight: true });

        // Burn dc to cause an update to subdao epoch info
        await burnDc(1);

        let offset = 0;
        async function getCurrEpochInfo() {
          const unixTime = Number(await getUnixTimestamp(provider)) + offset;
          return await program.account.subDaoEpochInfoV0.fetch(
            subDaoEpochInfoKey(subDao, unixTime)[0]
          );
        }

        async function ffwd(amount: number) {
          offset = amount;
          await vsrProgram.methods
            .setTimeOffsetV0(new BN(offset))
            .accounts({ registrar })
            .rpc({ skipPreflight: true });
        }

        // Start off the epoch with 0 vehnt since we staked at the start of the epoch
        let subDaoEpochInfo = await getCurrEpochInfo();
        expect(subDaoEpochInfo.vehntAtEpochStart.toNumber()).to.eq(0);

        // Fast forward to a later epoch before genesis end
        await ffwd(EPOCH_LENGTH * 10);
        // Burn dc to cause an update to subdao epoch info
        await burnDc(1);
        subDaoEpochInfo = await getCurrEpochInfo();
        expect(toNumber(subDaoEpochInfo.vehntAtEpochStart, 8)).to.eq(300 * 100);

        // Switch to a cliff vest (start cooldown)
        const {
          pubkeys: { genesisEndSubDaoEpochInfo },
        } = await program.methods
          .closeDelegationV0()
          .accounts({
            position,
            subDao,
            positionAuthority: positionAuthorityKp.publicKey,
          })
          .signers([positionAuthorityKp])
          .rpcAndKeys({ skipPreflight: true });
        await program.methods
          .resetLockupV0({
            kind: { cliff: {} },
            periods: 1464,
          })
          .accounts({
            dao,
            position: position,
            positionAuthority: positionAuthorityKp.publicKey,
          })
          .signers([positionAuthorityKp])
          .rpc({ skipPreflight: true });
        let subDaoAcc = await program.account.subDaoV0.fetch(subDao);
        expect(subDaoAcc.vehntDelegated.toNumber()).to.eq(0);
        expect(subDaoAcc.vehntFallRate.toNumber()).to.eq(0);
        const genesisEndEpoch = await program.account.subDaoEpochInfoV0.fetch(
          genesisEndSubDaoEpochInfo!
        );
        expect(genesisEndEpoch.vehntInClosingPositions.toNumber()).to.eq(0);
        expect(genesisEndEpoch.fallRatesFromClosingPositions.toNumber()).to.eq(
          0
        );

        const {
          pubkeys: {
            genesisEndSubDaoEpochInfo: finalGenesisEndSubDaoEpochInfo,
          },
        } = await program.methods
          .delegateV0()
          .accounts({
            position,
            subDao,
            positionAuthority: positionAuthorityKp.publicKey,
          })
          .signers([positionAuthorityKp])
          .rpcAndKeys({ skipPreflight: true });
        console.log(
          "Final end epoch subdao epoch info",
          finalGenesisEndSubDaoEpochInfo!.toBase58()
        );
        let positionAcc = await vsrProgram.account.positionV0.fetch(position);
        const stakeTime = positionAcc.lockup.startTs;

        console.log("Checking before genesis end");
        await ffwd(EPOCH_LENGTH * 20);
        await burnDc(1);
        subDaoEpochInfo = await getCurrEpochInfo();
        let currTime = subDaoEpochInfo.epoch.toNumber() * EPOCH_LENGTH;
        let timeStaked = currTime - stakeTime.toNumber();
        let expected = roundToDecimals(
          3 *
            100 *
            100 *
            ((1464 * EPOCH_LENGTH - timeStaked) / (1464 * EPOCH_LENGTH)),
          8
        );
        expect(toNumber(subDaoEpochInfo.vehntAtEpochStart, 8)).to.be.closeTo(
          // Fall rates aren't a perfect measurement, we divide the total fall of the position by
          // the total time staked. Imagine the total fall was 1 and the total time was 3. We would have
          // a fall rate of 0.3333333333333333 and could never have enough decimals to represent it
          expected,
          0.0000001
        );

        console.log("Checking genesis end");
        await ffwd(EPOCH_LENGTH * 1464);
        await burnDc(1);
        subDaoEpochInfo = await getCurrEpochInfo();
        currTime = subDaoEpochInfo.epoch.toNumber() * EPOCH_LENGTH;
        timeStaked = currTime - stakeTime.toNumber();
        expected = roundToDecimals(
          3 *
            100 *
            100 *
            ((1464 * EPOCH_LENGTH - timeStaked) / (1464 * EPOCH_LENGTH)),
          8
        );
        expect(toNumber(subDaoEpochInfo.vehntAtEpochStart, 8)).to.be.closeTo(
          expected,
          0.0000001
        );

        console.log("Checking after genesis end");
        await ffwd(EPOCH_LENGTH * 1466);
        await burnDc(1);
        subDaoEpochInfo = await getCurrEpochInfo();
        currTime = subDaoEpochInfo.epoch.toNumber() * EPOCH_LENGTH;
        timeStaked = currTime - stakeTime.toNumber();
        expected = roundToDecimals(
          100 *
            100 *
            ((1464 * EPOCH_LENGTH - timeStaked) / (1464 * EPOCH_LENGTH)),
          8
        );
        expect(toNumber(subDaoEpochInfo.vehntAtEpochStart, 8)).to.be.closeTo(
          expected,
          0.0000001
        );

        console.log("Checking at expiry");
        const unixTime = Number(await getUnixTimestamp(provider));
        const expiryOffset =
          stakeTime.toNumber() + EPOCH_LENGTH * 1464 - unixTime;
        await ffwd(expiryOffset);
        await burnDc(1);
        subDaoEpochInfo = await getCurrEpochInfo();
        currTime = subDaoEpochInfo.epoch.toNumber() * EPOCH_LENGTH;
        timeStaked = currTime - stakeTime.toNumber();
        expected = roundToDecimals(
          100 *
            100 *
            ((1464 * EPOCH_LENGTH - timeStaked) / (1464 * EPOCH_LENGTH)),
          8
        );
        expect(toNumber(subDaoEpochInfo.vehntAtEpochStart, 8)).to.be.closeTo(
          expected,
          0.0000001
        );

        console.log("Checking after expiry");
        await ffwd(expiryOffset + EPOCH_LENGTH * 2);
        await burnDc(1);
        subDaoEpochInfo = await getCurrEpochInfo();
        currTime = subDaoEpochInfo.epoch.toNumber() * EPOCH_LENGTH;
        timeStaked = currTime - stakeTime.toNumber();
        console.log(toNumber(subDaoEpochInfo.vehntAtEpochStart, 8));
        expect(toNumber(subDaoEpochInfo.vehntAtEpochStart, 8)).to.be.closeTo(
          0,
          0.0000001
        );
      });
    });
  });
});
