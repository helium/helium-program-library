import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { init as cbInit } from "@helium/circuit-breaker-sdk";
import { Keypair as HeliumKeypair } from "@helium/crypto";
import {
  daoKey,
  delegatorRewardsPercent,
  EPOCH_LENGTH,
} from "@helium/helium-sub-daos-sdk";
import { CircuitBreaker } from "@helium/idls/lib/types/circuit_breaker";
import { HeliumSubDaos } from "@helium/idls/lib/types/helium_sub_daos";
import { VoterStakeRegistry } from "@helium/idls/lib/types/voter_stake_registry";
import { Proposal } from "@helium/modular-governance-idls/lib/types/proposal";
import { init as initProposal } from "@helium/proposal-sdk";
import { init as initProxy } from "@helium/nft-proxy-sdk";
import {
  createAtaAndMint,
  createAtaAndTransfer,
  createMint,
  createMintInstructions,
  roundToDecimals,
  sendInstructions,
  toBN,
  toNumber,
} from "@helium/spl-utils";
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
import { init as dcInit, mintDataCredits } from "../packages/data-credits-sdk/src";
import {
  init as issuerInit,
  onboardIotHotspot,
} from "../packages/helium-entity-manager-sdk/src";
import {
  currentEpoch,
  subDaoEpochInfoKey,
  init as initHSD,
} from "../packages/helium-sub-daos-sdk/src";
import { init as vsrInit } from "../packages/voter-stake-registry-sdk/src";
import { DataCredits } from "../target/types/data_credits";
import { HeliumEntityManager } from "../target/types/helium_entity_manager";
import { burnDataCredits } from "./data-credits";
import { createMockCompression } from "./utils/compression";
import { NftProxy } from "@helium/modular-governance-idls/lib/types/nft_proxy";
import { initTestDao, initTestSubdao } from "./utils/daos";
import { expectBnAccuracy } from "./utils/expectBnAccuracy";
import {
  ensureDCIdl,
  ensureHSDIdl,
  ensureVSRIdl,
  initTestMaker,
  initTestRewardableEntityConfig,
  initWorld,
} from "./utils/fixtures";
import { getUnixTimestamp, loadKeypair } from "./utils/solana";
import { createPosition, initVsr } from "./utils/vsr";
// @ts-ignore
import bs58 from "bs58";
import { random } from "./utils/string";
import {
  notEmittedKey,
  notEmittedCounterKey,
  init as initBurn,
} from "@helium/no-emit-sdk";
import { NoEmit } from "../target/types/no_emit";

chai.use(chaiAsPromised);

const THREAD_PID = new PublicKey(
  "CLoCKyJ6DXBJqqu2VWx9RLbgnwwR6BMHHuyasVmfMzBh"
);

const EPOCH_REWARDS = 100000000;
const EPOCH_REWARDS_PLUS_NET_EMISSIONS =
  EPOCH_REWARDS + Math.floor((6 / 7) * 300);
const SUB_DAO_EPOCH_REWARDS = 10000000;
const SECS_PER_DAY = 86400;
const SECS_PER_YEAR = 365 * SECS_PER_DAY;
const MAX_LOCKUP = 4 * SECS_PER_YEAR;
const SCALE = 100;
const NOT_EMITTED_AMOUNT = 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("helium-sub-daos", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  let program: Program<HeliumSubDaos>;
  let dcProgram: Program<DataCredits>;
  let noEmitProgram: Program<NoEmit>;
  let hemProgram: Program<HeliumEntityManager>;
  let cbProgram: Program<CircuitBreaker>;
  let vsrProgram: Program<VoterStakeRegistry>;
  let proxyProgram: Program<NftProxy>;
  let proposalProgram: Program<Proposal>;

  let registrar: PublicKey;
  let position: PublicKey;
  let vault: PublicKey;
  let hntMint: PublicKey;
  let positionAuthorityKp: Keypair;

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;

  before(async () => {
    program = await initHSD(
      provider,
      anchor.workspace.HeliumSubDaos.programId,
      anchor.workspace.HeliumSubDaos.idl
    );
    dcProgram = await dcInit(
      provider,
      anchor.workspace.DataCredits.programId,
      anchor.workspace.DataCredits.idl
    );
    noEmitProgram = await initBurn(
      provider,
      anchor.workspace.NoEmit.programId,
      anchor.workspace.NoEmit.idl
    );
    cbProgram = await cbInit(
      provider,
      anchor.workspace.CircuitBreaker.programId,
      anchor.workspace.CircuitBreaker.idl
    );
    ensureDCIdl();
    ensureHSDIdl();
    hemProgram = await issuerInit(
      provider,
      anchor.workspace.HeliumEntityManager.programId,
      anchor.workspace.HeliumEntityManager.idl
    );
    proxyProgram = await initProxy(provider);

    vsrProgram = await vsrInit(
      provider,
      anchor.workspace.VoterStakeRegistry.programId,
      anchor.workspace.VoterStakeRegistry.idl
    );
    ensureVSRIdl();

    proposalProgram = await initProposal(provider);
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
      await initTestSubdao({
        hsdProgram: program,
        provider,
        authority: provider.wallet.publicKey,
        dao,
      });

    const account = await program.account.subDaoV0.fetch(subDao!);
    const breaker =
      await cbProgram.account.accountWindowedCircuitBreakerV0.fetch(
        treasuryCircuitBreaker
      );

    // @ts-ignore
    expect(Boolean(breaker.config.thresholdType.percent)).to.be.true;

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
    let proxySeasonEnd = new BN(
      new Date().valueOf() / 1000 + 24 * 60 * 60 * 5 * 365
    );
    let initialSupply = toBN(223_000_000, 8);

    async function burnDc(
      amount: number
    ): Promise<{ subDaoEpochInfo: PublicKey }> {
      await provider.sendAll(
        (await mintDataCredits({
          program: dcProgram,
          hntAmount: toBN(amount, 8),
          dcMint,
        })).txs
      );

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
        toBN(100000000, 8),
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
        proxyProgram,
        provider,
        me,
        hntMint,
        daoKey(hntMint)[0],
        genesisVotePowerMultiplierExpirationTs,
        3,
        proxySeasonEnd
      ));

      ({
        dataCredits: { dcMint },
        subDao: { subDao, treasury },
        dao: { dao, rewardsEscrow },
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
          hstPool: null,
          netEmissionsCap: null,
          proposalNamespace: null,
          delegatorRewardsPercent: null,
          rewardsEscrow: null,
        })
        .accountsPartial({
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
          onboardingDataOnlyDcFee: null,
          registrar: null,
          activeDeviceAuthority: null,
        })
        .accountsPartial({
          subDao,
        })
        .rpc({ skipPreflight: true });

      const subDaoAcc = await program.account.subDaoV0.fetch(subDao);
      expect(subDaoAcc.authority.toString()).to.eq(newAuth.toString());
    });

    it("allows tracking dc spend", async () => {
      const { subDaoEpochInfo } = await burnDc(10);

      const epochInfo = await program.account.subDaoEpochInfoV0.fetch(
        subDaoEpochInfo
      );

      expect(epochInfo.dcBurned.toNumber()).eq(toBN(10, 0).toNumber());
    });

    it("accounts for not emitted HNT when calculating utility scores", async () => {
      const mint = Keypair.generate();
      await hemProgram.methods
        .issueNotEmittedEntityV0()
        .preInstructions(
          await createMintInstructions(provider, 0, me, me, mint)
        )
        .accountsPartial({
          dao,
          mint: mint.publicKey,
        })
        .signers([mint])
        .rpc({ skipPreflight: true });

      const notEmittedAmount = new BN(NOT_EMITTED_AMOUNT);
      const [noEmitWallet] = notEmittedKey();
      const [noEmitCounterKey] = notEmittedCounterKey(hntMint);

      async function emitAndVerifyEpoch() {
        await createAtaAndTransfer(
          provider,
          hntMint,
          notEmittedAmount,
          me,
          noEmitWallet
        );

        await noEmitProgram.methods
          .noEmitV0()
          .accounts({ mint: hntMint })
          .rpc({ skipPreflight: true });

        const { subDaoEpochInfo } = await burnDc(10);
        const epoch = (
          await program.account.subDaoEpochInfoV0.fetch(subDaoEpochInfo)
        ).epoch;

        const method = program.methods
          .calculateUtilityScoreV0({ epoch })
          .accountsPartial({ subDao, dao });

        const { daoEpochInfo } = await method.pubkeys();
        await method.rpc({ skipPreflight: true });

        const noEmitCounter =
          await noEmitProgram.account.notEmittedCounterV0.fetch(
            noEmitCounterKey
          );
        const daoEpochInfoAcc = await program.account.daoEpochInfoV0.fetch(
          daoEpochInfo!
        );

        return { noEmitCounter, daoEpochInfoAcc };
      }

      const firstEpoch = await emitAndVerifyEpoch();
      expect(firstEpoch.daoEpochInfoAcc.cumulativeNotEmitted.toString()).to.eq(
        firstEpoch.noEmitCounter.amountNotEmitted.toString()
      );
      expect(firstEpoch.daoEpochInfoAcc.notEmitted.toString()).to.eq(
        notEmittedAmount.toString()
      );

      let expectedRewards = EPOCH_REWARDS_PLUS_NET_EMISSIONS;
      expect(firstEpoch.daoEpochInfoAcc.totalRewards.toString()).to.eq(
        expectedRewards.toString()
      );

      const supply = (await getMint(provider.connection, hntMint)).supply;
      expect(firstEpoch.daoEpochInfoAcc.currentHntSupply.toString()).to.eq(
        new BN(supply.toString()).add(new BN(expectedRewards)).toString()
      );
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
          .accountsPartial({ registrar })
          .rpc({ skipPreflight: true });
        await program.methods
          .calculateUtilityScoreV0({
            epoch,
          })
          .preInstructions([
            ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
          ])
          .accountsPartial({
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
          lockupPeriods: 365,
          lockupAmount: 100,
          expectedMultiplier:
            Math.min((SECS_PER_DAY * 365) / MAX_LOCKUP, 1) * SCALE,
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
      {
        name: "Case 3",
        options: {
          delay: 0,
          lockupPeriods: 365 * 4,
          lockupAmount: 50,
          expectedMultiplier:
            Math.min((SECS_PER_DAY * 365 * 4) / MAX_LOCKUP, 1) * SCALE,
        },
      },
      {
        name: "Case 4 (Cliff 100 4 years)",
        options: {
          delay: 15000,
          lockupPeriods: 365 * 4,
          lockupAmount: 100,
          kind: { cliff: {} },
          expectedMultiplier:
            Math.min((SECS_PER_DAY * 365 * 4) / MAX_LOCKUP, 1) * SCALE,
        },
      },
      {
        name: "Case 5 (Constant 100 4 years)",
        options: {
          delay: 0,
          lockupPeriods: 365 * 4,
          lockupAmount: 100,
          kind: { constant: {} },
          expectedMultiplier:
            Math.min((SECS_PER_DAY * 365 * 4) / MAX_LOCKUP, 1) * SCALE,
        },
      },
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
            .accountsPartial({
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
          const positionAcc = await vsrProgram.account.positionV0.fetch(
            position
          );
          const endTs = positionAcc.lockup.endTs.toNumber();
          const startTs = positionAcc.lockup.startTs.toNumber();
          const multiplier =
            typeof positionAcc.lockup.kind.cliff === "undefined"
              ? 1
              : (endTs - sdAcc.vehntLastCalculatedTs.toNumber()) /
              (endTs - startTs);

          const expectedVeHnt =
            options.lockupAmount * options.expectedMultiplier * multiplier;

          expectBnAccuracy(
            toBN(expectedVeHnt, 8).mul(new BN("1000000000000")),
            sdAcc.vehntDelegated,
            typeof options.kind?.constant !== "undefined" ? 0 : 0.00000000001
          );
          expectBnAccuracy(lockupAmount, acc.hntAmount, 0.01);
        });

        it("calculates subdao rewards", async () => {
          // Onboard one hotspot to add to the utility score
          const { rewardableEntityConfig } =
            await initTestRewardableEntityConfig(hemProgram, subDao);
          const { maker, collection, makerKeypair, merkle } =
            await initTestMaker(
              hemProgram,
              provider,
              rewardableEntityConfig,
              dao
            );
          const eccVerifier = loadKeypair(
            __dirname + "/keypairs/verifier-test.json"
          );
          const ecc = (await HeliumKeypair.makeRandom()).address.b58;
          const hotspotOwner = Keypair.generate();

          const { getAssetFn, getAssetProofFn, hotspot } =
            await createMockCompression({
              collection,
              dao,
              merkle,
              ecc,
              hotspotOwner: hotspotOwner.publicKey,
            });
          const issueMethod = hemProgram.methods
            .issueEntityV0({
              entityKey: Buffer.from(bs58.decode(ecc)),
            })
            .preInstructions([
              ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
            ])
            .accountsPartial({
              maker,
              recipient: hotspotOwner.publicKey,
              issuingAuthority: makerKeypair.publicKey,
              dao,
              eccVerifier: eccVerifier.publicKey,
            })
            .signers([makerKeypair, eccVerifier]);

          await issueMethod.rpc({ skipPreflight: true });
          await provider.sendAll(
            (await mintDataCredits({
              program: dcProgram,
              dcAmount: toBN(60, 5),
              dcMint,
            })).txs
          );

          const method = (
            await onboardIotHotspot({
              program: hemProgram,
              assetId: hotspot,
              maker,
              dao,
              rewardableEntityConfig,
              location: new BN(1000),
              getAssetFn,
              getAssetProofFn,
              dcFeePayer: me,
            })
          ).signers([makerKeypair, hotspotOwner]);

          const {
            pubkeys: { iotInfo: infoKey },
          } = await method.rpcAndKeys({ skipPreflight: true });

          await hemProgram.methods
            .setEntityActiveV0({
              isActive: true,
              entityKey: Buffer.from(bs58.decode(ecc)),
            })
            .accountsPartial({
              activeDeviceAuthority: me,
              rewardableEntityConfig,
              info: infoKey! as PublicKey,
            })
            .rpc({ skipPreflight: true });

          const { subDaoEpochInfo } = await burnDc(1600000);
          const epoch = (
            await program.account.subDaoEpochInfoV0.fetch(subDaoEpochInfo)
          ).epoch;

          // delegate some vehnt
          await program.methods
            .delegateV0()
            .accountsPartial({
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
            .accountsPartial({
              subDao,
              dao,
            });

          const pubkeys = await instr.pubkeys();
          await instr.rpc({
            skipPreflight: true,
            commitment: "confirmed",
          });

          const subDaoInfo = await program.account.subDaoEpochInfoV0.fetch(
            subDaoEpochInfo
          );
          const daoInfo = await program.account.daoEpochInfoV0.fetch(
            pubkeys.daoEpochInfo!
          );

          expect(daoInfo.numUtilityScoresCalculated).to.eq(1);

          const supply = (await getMint(provider.connection, hntMint)).supply;
          const veHnt = toNumber(subDaoInfo.vehntAtEpochStart, 8);
          const totalUtility = veHnt;
          expect(daoInfo.totalRewards.toString()).to.eq(
            EPOCH_REWARDS_PLUS_NET_EMISSIONS.toString()
          );
          expect(daoInfo.currentHntSupply.toString()).to.eq(
            new BN(supply.toString())
              .add(new BN(EPOCH_REWARDS_PLUS_NET_EMISSIONS))
              .toString()
          );

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
            .accountsPartial({
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
              periods: 365 * 4,
            })
            .accountsPartial({
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
              .accountsPartial({
                position,
                subDao,
                positionAuthority: positionAuthorityKp.publicKey,
              })
              .signers([positionAuthorityKp])
              .rpc({ skipPreflight: true });
          });

          it("allows changing delegation", async () => {
            const newSubDaoInfo = await initTestSubdao({
              hsdProgram: program,
              provider,
              authority: provider.wallet.publicKey,
              dao: dao,
              epochRewards: 100,
              numTokens: new BN(0),
            })
            await vsrProgram.methods
              .setTimeOffsetV0(new BN(EPOCH_LENGTH * 5))
              .accountsPartial({ registrar })
              .rpc({ skipPreflight: true });
            const method = await program.methods
              .changeDelegationV0()
              .accountsPartial({
                position,
                oldSubDao: subDao,
                subDao: newSubDaoInfo.subDao,
                positionAuthority: positionAuthorityKp.publicKey,
              })
              .signers([positionAuthorityKp]);

            const { delegatedPosition, oldSubDao } =
              await method.pubkeys();
            const oldDelegatedPositionAcc = await program.account.delegatedPositionV0.fetch(delegatedPosition!);
            await method.rpc({ skipPreflight: true });

            const newDelegatedPositionAcc = await program.account.delegatedPositionV0.fetch(delegatedPosition!);
            expect(oldDelegatedPositionAcc.lastClaimedEpoch.toNumber()).to.eq(newDelegatedPositionAcc.lastClaimedEpoch.toNumber());
            expect(oldDelegatedPositionAcc.claimedEpochsBitmap.toString()).to.eq(newDelegatedPositionAcc.claimedEpochsBitmap.toString());

            const oldSdAcc = await program.account.subDaoV0.fetch(oldSubDao!);

            expect(oldSdAcc.vehntFallRate.toNumber()).to.eq(0);
            expect(oldSdAcc.vehntDelegated.toNumber() / 1000000000000).to.be.closeTo(0, 15);

            const newSdAcc = await program.account.subDaoV0.fetch(newSubDaoInfo.subDao);
            const positionAcc = await vsrProgram.account.positionV0.fetch(
              position
            );
            const endTs = positionAcc.lockup.endTs.toNumber();
            const startTs = positionAcc.lockup.startTs.toNumber();
            const multiplier =
              typeof positionAcc.lockup.kind.cliff === "undefined"
                ? 1
                : (endTs - oldSdAcc.vehntLastCalculatedTs.toNumber()) /
                (endTs - startTs);

            const expectedVeHnt =
              options.lockupAmount * options.expectedMultiplier * multiplier;

            expectBnAccuracy(
              toBN(expectedVeHnt, 8).mul(new BN("1000000000000")),
              newSdAcc.vehntDelegated,
              typeof options.kind?.constant !== "undefined" ? 0 : 0.00000000001
            );
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
                .accountsPartial({
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
                .accountsPartial({
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
              .accountsPartial({
                position,
                subDao,
                positionAuthority: positionAuthorityKp.publicKey,
              })
              .signers([positionAuthorityKp]);

            const { delegatedPosition, subDaoEpochInfo } =
              await method.pubkeys();
            await method.rpc({ skipPreflight: true });

            const sdAcc = await program.account.subDaoV0.fetch(subDao);

            expect(sdAcc.vehntFallRate.toNumber()).to.eq(0);
            // Extremely precise u128 can be off by dust.
            expect(sdAcc.vehntDelegated.toNumber()).to.be.closeTo(0, 15);

            assert.isFalse(
              !!(await provider.connection.getAccountInfo(delegatedPosition!))
            );
          });

          describe("with multiple delegated vehnt", () => {
            let basePosition: PublicKey;
            let basePositionOptions = {
              lockupPeriods: 365 * 1,
              lockupAmount: 1000000,
              kind: { cliff: {} },
              expectedMultiplier:
                Math.min((SECS_PER_DAY * 365 * 1) / MAX_LOCKUP, 1) * SCALE,
            };

            beforeEach(async () => {
              ({ position: basePosition } = await createPosition(
                vsrProgram,
                provider,
                registrar,
                hntMint,
                basePositionOptions,
                positionAuthorityKp
              ));

              await program.methods
                .delegateV0()
                .accountsPartial({
                  position: basePosition,
                  subDao,
                  positionAuthority: positionAuthorityKp.publicKey,
                })
                .signers([positionAuthorityKp])
                .rpc({ skipPreflight: true });
            });

            it("delegates proper vehnt amount", async () => {
              const sdAcc = await program.account.subDaoV0.fetch(subDao);

              const expectedVehnt =
                options.lockupAmount * options.expectedMultiplier +
                basePositionOptions.lockupAmount *
                basePositionOptions.expectedMultiplier;

              expectBnAccuracy(
                toBN(expectedVehnt, 8).mul(new BN("1000000000000")),
                sdAcc.vehntDelegated,
                0.0000001
              );
            });

            it("allows closing delegate", async () => {
              const method = program.methods
                .closeDelegationV0()
                .accountsPartial({
                  position: basePosition,
                  subDao,
                  positionAuthority: positionAuthorityKp.publicKey,
                })
                .signers([positionAuthorityKp]);

              const { delegatedPosition, subDaoEpochInfo } =
                await method.pubkeys();
              // const sed = await program.account.subDaoEpochInfoV0.fetch(
              //   subDaoEpochInfo!
              // );
              // console.log(sed.fallRatesFromClosingPositions.toString());
              // console.log(sed.vehntInClosingPositions.toString());
              await method.rpc({ skipPreflight: true });

              const sdAcc = await program.account.subDaoV0.fetch(subDao);
              const positionAcc = await vsrProgram.account.positionV0.fetch(
                position
              );
              const endTs = positionAcc.lockup.endTs.toNumber();
              const startTs = positionAcc.lockup.startTs.toNumber();
              const multiplier =
                typeof positionAcc.lockup.kind.cliff === "undefined"
                  ? 1
                  : (endTs - sdAcc.vehntLastCalculatedTs.toNumber()) /
                  (endTs - startTs);

              const expectedVehnt =
                options.lockupAmount * options.expectedMultiplier * multiplier;

              expectBnAccuracy(
                toBN(expectedVehnt, 8).mul(new BN("1000000000000")),
                sdAcc.vehntDelegated,
                0.0000000001
              );

              expect(sdAcc.vehntFallRate.toNumber()).to.be.closeTo(
                typeof positionAcc.lockup.kind.cliff !== "undefined"
                  ? ((options.lockupAmount * options.expectedMultiplier) /
                    (endTs - startTs)) *
                  100000000000000000000
                  : 0,
                1
              );

              assert.isFalse(
                !!(await provider.connection.getAccountInfo(delegatedPosition!))
              );
            });
          });

          describe("with calculated rewards", () => {
            let epoch: anchor.BN;
            let subDaoEpochInfo: PublicKey;

            beforeEach(async () => {
              await vsrProgram.methods
                .setTimeOffsetV0(new BN(1 * 60 * 60 * 24))
                .accountsPartial({ registrar })
                .rpc({ skipPreflight: true });

              ({ subDaoEpochInfo } = await burnDc(1600000));
              epoch = (
                await program.account.subDaoEpochInfoV0.fetch(subDaoEpochInfo)
              ).epoch;

              await program.methods
                .calculateUtilityScoreV0({
                  epoch,
                })
                .preInstructions([
                  ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
                ])
                .accountsPartial({
                  subDao,
                  dao,
                })
                .rpc({ skipPreflight: true });
            });

            it("issues hnt rewards to subdaos, dnt to rewards escrow, and hst to hst pool", async () => {
              const preTreasuryBalance = AccountLayout.decode(
                (await provider.connection.getAccountInfo(treasury))?.data!
              ).amount;
              const preHstBalance = AccountLayout.decode(
                (await provider.connection.getAccountInfo(hstPool))?.data!
              ).amount;
              const preHntBalance = AccountLayout.decode(
                (await provider.connection.getAccountInfo(rewardsEscrow))?.data!
              ).amount;
              const {
                pubkeys: { prevSubDaoEpochInfo, daoEpochInfo },
              } = await program.methods
                .issueRewardsV0({
                  epoch,
                })
                .accountsPartial({
                  subDao,
                })
                .rpcAndKeys({ skipPreflight: true });

              console.log(
                "subDaoEpochInfo",
                await program.account.subDaoEpochInfoV0.fetch(subDaoEpochInfo!)
              );
              console.log(
                "prevSubDaoEpochInfo",
                await program.account.subDaoEpochInfoV0.fetch(
                  prevSubDaoEpochInfo!
                )
              );
              console.log(
                "daoEpochInfo",
                await program.account.daoEpochInfoV0.fetch(daoEpochInfo!)
              );

              const postTreasuryBalance = AccountLayout.decode(
                (await provider.connection.getAccountInfo(treasury))?.data!
              ).amount;
              const postHntBalance = AccountLayout.decode(
                (await provider.connection.getAccountInfo(rewardsEscrow))?.data!
              ).amount;
              const postHstBalance = AccountLayout.decode(
                (await provider.connection.getAccountInfo(hstPool))?.data!
              ).amount;
              expect(Number(postHntBalance - preHntBalance)).to.be.closeTo(
                EPOCH_REWARDS_PLUS_NET_EMISSIONS * (1 - 0.06),
                1 // Allow for 1 unit of difference to handle rounding
              );
              expect((postHstBalance - preHstBalance).toString()).to.eq("0");
              expect(
                (postTreasuryBalance - preTreasuryBalance).toString()
              ).to.eq("0");

              const acc = await program.account.subDaoEpochInfoV0.fetch(
                subDaoEpochInfo
              );
              expect(Boolean(acc.rewardsIssuedAt)).to.be.true;
            });

            it("claim rewards", async () => {
              // Create and vote on two proposals
              const {
                pubkeys: { proposalConfig },
              } = await proposalProgram.methods
                .initializeProposalConfigV0({
                  name: random(10),
                  voteController: registrar,
                  stateController: me,
                  onVoteHook: PublicKey.default,
                  authority: me,
                })
                .rpcAndKeys({ skipPreflight: true });
              for (let i = 0; i < 2; i++) {
                const proposalName = `Proposal ${random(10)}`;
                const {
                  pubkeys: { proposal },
                } = await proposalProgram.methods
                  .initializeProposalV0({
                    seed: Buffer.from(proposalName, "utf-8"),
                    maxChoicesPerVoter: 1,
                    name: proposalName,
                    uri: "https://example.com",
                    choices: [
                      { name: "Yes", uri: null },
                      { name: "No", uri: null },
                    ],
                    tags: ["test"],
                  })
                  .accountsPartial({ proposalConfig })
                  .rpcAndKeys({ skipPreflight: true });
                await proposalProgram.methods
                  .updateStateV0({
                    newState: {
                      voting: {
                        startTs: new anchor.BN(new Date().valueOf() / 1000),
                      } as any,
                    },
                  })
                  .accountsPartial({ proposal })
                  .rpc({ skipPreflight: true });
                const {
                  pubkeys: { marker },
                } = await vsrProgram.methods
                  .voteV0({
                    choice: 0,
                  })
                  .accountsPartial({
                    position,
                    proposal: proposal as PublicKey,
                    voter: positionAuthorityKp.publicKey,
                    proposalConfig,
                    stateController: me,
                    onVoteHook: PublicKey.default,
                  })
                  .signers([positionAuthorityKp])
                  .rpcAndKeys({ skipPreflight: true });
                // Ensure dao pays resize
                await sendInstructions(provider, [
                  SystemProgram.transfer({
                    fromPubkey: me,
                    toPubkey: dao,
                    lamports: 1000000000,
                  }),
                ]);
                await program.methods
                  .addRecentProposalToDaoV0()
                  .accountsStrict({
                    dao: dao!,
                    proposal: proposal!,
                  })
                  .rpc({ skipPreflight: true });
              }
              // issue rewards
              await sendInstructions(provider, [
                await program.methods
                  .issueRewardsV0({
                    epoch,
                  })
                  .accountsPartial({
                    subDao,
                  })
                  .instruction(),
              ]);

              const method = program.methods
                .claimRewardsV1({
                  epoch,
                })
                .accountsPartial({
                  position,
                  subDao,
                  payer: positionAuthorityKp.publicKey,
                  positionAuthority: positionAuthorityKp.publicKey,
                })
                .signers([positionAuthorityKp]);
              const { delegatorAta } = await method.pubkeys();
              const preAtaBalance = AccountLayout.decode(
                (await provider.connection.getAccountInfo(delegatorAta!))?.data!
              ).amount;
              await method.rpc({ skipPreflight: true });

              const postAtaBalance = AccountLayout.decode(
                (await provider.connection.getAccountInfo(delegatorAta!))?.data!
              ).amount;
              expect(
                Number(postAtaBalance) - Number(preAtaBalance)
              ).to.be.within(
                EPOCH_REWARDS_PLUS_NET_EMISSIONS *
                (delegatorRewardsPercent(6).toNumber() / 10_000000000) -
                5,
                EPOCH_REWARDS_PLUS_NET_EMISSIONS *
                (delegatorRewardsPercent(6).toNumber() / 10_000000000) +
                5
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
            lockupPeriods: 1460,
            lockupAmount: 100,
            kind: { constant: {} },
          },
          positionAuthorityKp
        ));
        await program.methods
          .delegateV0()
          .accountsPartial({
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
            .accountsPartial({ registrar })
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
          .accountsPartial({
            position,
            subDao,
            positionAuthority: positionAuthorityKp.publicKey,
          })
          .signers([positionAuthorityKp])
          .rpcAndKeys({ skipPreflight: true });
        await program.methods
          .resetLockupV0({
            kind: { cliff: {} },
            periods: 1460,
          })
          .accountsPartial({
            dao,
            position: position,
            positionAuthority: positionAuthorityKp.publicKey,
          })
          .signers([positionAuthorityKp])
          .rpc({ skipPreflight: true });
        let subDaoAcc = await program.account.subDaoV0.fetch(subDao);
        expect(subDaoAcc.vehntDelegated.eq(new BN(0))).to.be.true;
        expect(subDaoAcc.vehntFallRate.eq(new BN(0))).to.be.true;
        const genesisEndEpoch = await program.account.subDaoEpochInfoV0.fetch(
          genesisEndSubDaoEpochInfo!
        );
        expect(genesisEndEpoch.vehntInClosingPositions.eq(new BN(0))).to.be
          .true;
        expect(genesisEndEpoch.fallRatesFromClosingPositions.eq(new BN(0))).to
          .be.true;

        const {
          pubkeys: {
            genesisEndSubDaoEpochInfo: finalGenesisEndSubDaoEpochInfo,
          },
        } = await program.methods
          .delegateV0()
          .accountsPartial({
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
          ((1460 * EPOCH_LENGTH - timeStaked) / (1460 * EPOCH_LENGTH)),
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
        await ffwd(EPOCH_LENGTH * 1460);
        await burnDc(1);
        subDaoEpochInfo = await getCurrEpochInfo();
        currTime = subDaoEpochInfo.epoch.toNumber() * EPOCH_LENGTH;
        timeStaked = currTime - stakeTime.toNumber();
        expected = roundToDecimals(
          3 *
          100 *
          100 *
          ((1460 * EPOCH_LENGTH - timeStaked) / (1460 * EPOCH_LENGTH)),
          8
        );
        expect(toNumber(subDaoEpochInfo.vehntAtEpochStart, 8)).to.be.closeTo(
          expected,
          0.0000001
        );

        console.log("Checking after genesis end");
        await ffwd(EPOCH_LENGTH * 1461);
        await burnDc(1);
        subDaoEpochInfo = await getCurrEpochInfo();
        currTime = subDaoEpochInfo.epoch.toNumber() * EPOCH_LENGTH;
        timeStaked = currTime - stakeTime.toNumber();
        expected = roundToDecimals(
          100 *
          100 *
          ((1460 * EPOCH_LENGTH - timeStaked) / (1460 * EPOCH_LENGTH)),
          8
        );
        expect(toNumber(subDaoEpochInfo.vehntAtEpochStart, 8)).to.be.closeTo(
          expected,
          0.0000001
        );

        console.log("Checking at expiry");
        const unixTime = Number(await getUnixTimestamp(provider));
        const expiryOffset =
          stakeTime.toNumber() + EPOCH_LENGTH * 1460 - unixTime;
        await ffwd(expiryOffset);
        await burnDc(1);
        subDaoEpochInfo = await getCurrEpochInfo();
        currTime = subDaoEpochInfo.epoch.toNumber() * EPOCH_LENGTH;
        timeStaked = currTime - stakeTime.toNumber();
        expected = roundToDecimals(
          100 *
          100 *
          ((1460 * EPOCH_LENGTH - timeStaked) / (1460 * EPOCH_LENGTH)),
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

      it("correctly adjusts total vehnt at epoch start with unchanging genesis positions", async () => {
        ({ position, vault } = await createPosition(
          vsrProgram,
          provider,
          registrar,
          hntMint,
          // max lockup
          {
            lockupPeriods: 1460,
            lockupAmount: 100,
            kind: { cliff: {} },
          },
          positionAuthorityKp
        ));
        await program.methods
          .delegateV0()
          .accountsPartial({
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
            .accountsPartial({ registrar })
            .rpc({ skipPreflight: true });
        }

        // Start off the epoch with 0 vehnt since we staked at the start of the epoch
        let subDaoEpochInfo = await getCurrEpochInfo();
        expect(subDaoEpochInfo.vehntAtEpochStart.toNumber()).to.eq(0);

        // Fast forward to a later epoch before genesis end
        console.log("Checking before genesis end");
        await ffwd(EPOCH_LENGTH * 10);
        // Burn dc to cause an update to subdao epoch info
        await burnDc(1);
        subDaoEpochInfo = await getCurrEpochInfo();
        let positionAcc = await vsrProgram.account.positionV0.fetch(position);
        const stakeTime = positionAcc.lockup.startTs;
        let currTime = subDaoEpochInfo.epoch.toNumber() * EPOCH_LENGTH;
        let timeStaked = currTime - stakeTime.toNumber();
        let expected = roundToDecimals(
          3 *
          100 *
          100 *
          ((1460 * EPOCH_LENGTH - timeStaked) / (1460 * EPOCH_LENGTH)),
          8
        );
        expect(toNumber(subDaoEpochInfo.vehntAtEpochStart, 8)).to.be.closeTo(
          expected,
          0.0000001
        );


        console.log("Checking genesis end");
        await ffwd(EPOCH_LENGTH * 1460);
        await burnDc(1);
        subDaoEpochInfo = await getCurrEpochInfo();
        currTime = subDaoEpochInfo.epoch.toNumber() * EPOCH_LENGTH;
        timeStaked = currTime - stakeTime.toNumber();
        expected = roundToDecimals(
          3 *
          100 *
          100 *
          ((1460 * EPOCH_LENGTH - timeStaked) / (1460 * EPOCH_LENGTH)),
          8
        );
        expect(toNumber(subDaoEpochInfo.vehntAtEpochStart, 8)).to.be.closeTo(
          expected,
          0.0000001
        );

        console.log("Checking after genesis end");
        await ffwd(EPOCH_LENGTH * 1461);
        await burnDc(1);
        subDaoEpochInfo = await getCurrEpochInfo();
        currTime = subDaoEpochInfo.epoch.toNumber() * EPOCH_LENGTH;
        timeStaked = currTime - stakeTime.toNumber();
        expected = 0;
        expect(toNumber(subDaoEpochInfo.vehntAtEpochStart, 8)).to.eq(0)
      });

      it("allows adding expiration ts", async () => {
        const registrarAcc = await vsrProgram.account.registrar.fetch(
          registrar
        );
        const proxyConfig = registrarAcc.proxyConfig;

        ({ position, vault } = await createPosition(
          vsrProgram,
          provider,
          registrar,
          hntMint,
          // max lockup
          {
            lockupPeriods: 1460,
            lockupAmount: 100,
            kind: { cliff: {} },
          },
          positionAuthorityKp
        ));
        const {
          pubkeys: { closingTimeSubDaoEpochInfo, genesisEndSubDaoEpochInfo },
        } = await program.methods
          .delegateV0()
          .accountsPartial({
            position,
            subDao,
            positionAuthority: positionAuthorityKp.publicKey,
          })
          .signers([positionAuthorityKp])
          .rpcAndKeys({ skipPreflight: true });
        const seasonEnd = new BN(
          new Date().valueOf() / 1000 + EPOCH_LENGTH * 5
        );
        await proxyProgram.methods
          .updateProxyConfigV0({
            maxProxyTime: null,
            seasons: [
              {
                start: new BN(0),
                end: seasonEnd,
              },
            ],
          })
          .accountsPartial({
            proxyConfig,
            authority: me,
          })
          .rpc({ skipPreflight: true });
        const subDaoEpochInfo = await program.account.subDaoEpochInfoV0.fetch(
          closingTimeSubDaoEpochInfo!
        );
        const expectedFallRates =
          subDaoEpochInfo.fallRatesFromClosingPositions.toString();
        const expectedVehntInClosingPositions =
          subDaoEpochInfo.vehntInClosingPositions.toString();
        const newClosingTimeSubDaoEpochInfo = subDaoEpochInfoKey(
          subDao,
          seasonEnd
        )[0];

        await program.methods
          .extendExpirationTsV0()
          .accountsPartial({
            position,
            subDao,
            oldClosingTimeSubDaoEpochInfo: closingTimeSubDaoEpochInfo,
            closingTimeSubDaoEpochInfo: newClosingTimeSubDaoEpochInfo,
            authority: positionAuthorityKp.publicKey,
          })
          .signers([positionAuthorityKp])
          .rpc({ skipPreflight: true });

        console.log(
          closingTimeSubDaoEpochInfo!.toBase58(),
          newClosingTimeSubDaoEpochInfo!.toBase58()
        );
        const oldSubDaoEpochInfo =
          await program.account.subDaoEpochInfoV0.fetch(
            closingTimeSubDaoEpochInfo!
          );
        expect(
          oldSubDaoEpochInfo.fallRatesFromClosingPositions.toNumber()
        ).to.eq(0);
        expect(oldSubDaoEpochInfo.vehntInClosingPositions.toNumber()).to.eq(0);

        const newSubDaoEpochInfo =
          await program.account.subDaoEpochInfoV0.fetch(
            newClosingTimeSubDaoEpochInfo!
          );
        expect(
          newSubDaoEpochInfo.fallRatesFromClosingPositions.toString()
        ).to.eq("23782343987823439");

        const genesisEndEpoch = await program.account.subDaoEpochInfoV0.fetch(
          genesisEndSubDaoEpochInfo!
        );
        expect(genesisEndEpoch.fallRatesFromClosingPositions.toNumber()).to.eq(
          0
        );
        expect(genesisEndEpoch.vehntInClosingPositions.toNumber()).to.eq(0);
      });

      describe("with proxy season that ends before genesis end", () => {
        before(async () => {
          // 15 days from now
          proxySeasonEnd = new BN(
            new Date().valueOf() / 1000 + 15 * EPOCH_LENGTH
          );
        });

        it("correctly adjusts total vehnt at epoch start with changing genesis positions", async () => {
          ({ position, vault } = await createPosition(
            vsrProgram,
            provider,
            registrar,
            hntMint,
            // max lockup
            {
              lockupPeriods: 1460,
              lockupAmount: 100,
              kind: { constant: {} },
            },
            positionAuthorityKp
          ));
          await program.methods
            .delegateV0()
            .accountsPartial({
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
              .accountsPartial({ registrar })
              .rpc({ skipPreflight: true });
          }

          // Start off the epoch with 0 vehnt since we staked at the start of the epoch
          let subDaoEpochInfo = await getCurrEpochInfo();
          expect(subDaoEpochInfo.vehntAtEpochStart.toNumber()).to.eq(0);

          // Fast forward to a later epoch before genesis end and position expiration
          await ffwd(EPOCH_LENGTH * 10);
          // Burn dc to cause an update to subdao epoch info
          await burnDc(1);
          subDaoEpochInfo = await getCurrEpochInfo();
          expect(toNumber(subDaoEpochInfo.vehntAtEpochStart, 8)).to.eq(
            300 * 100
          );

          // Switch to a cliff vest (start cooldown)
          const {
            pubkeys: { genesisEndSubDaoEpochInfo },
          } = await program.methods
            .closeDelegationV0()
            .accountsPartial({
              position,
              subDao,
              positionAuthority: positionAuthorityKp.publicKey,
            })
            .signers([positionAuthorityKp])
            .rpcAndKeys({ skipPreflight: true });
          await program.methods
            .resetLockupV0({
              kind: { cliff: {} },
              periods: 1460,
            })
            .accountsPartial({
              dao,
              position: position,
              positionAuthority: positionAuthorityKp.publicKey,
            })
            .signers([positionAuthorityKp])
            .rpc({ skipPreflight: true });
          let subDaoAcc = await program.account.subDaoV0.fetch(subDao);
          console.log(subDaoAcc.vehntDelegated);
          console.log(subDaoAcc.vehntFallRate);
          expect(subDaoAcc.vehntDelegated.eq(new BN(0))).to.be.true;
          expect(subDaoAcc.vehntFallRate.eq(new BN(0))).to.be.true;
          const genesisEndEpoch = await program.account.subDaoEpochInfoV0.fetch(
            genesisEndSubDaoEpochInfo!
          );
          expect(genesisEndEpoch.vehntInClosingPositions.eq(new BN(0))).to.be
            .true;
          expect(genesisEndEpoch.fallRatesFromClosingPositions.eq(new BN(0))).to
            .be.true;

          const {
            pubkeys: {
              genesisEndSubDaoEpochInfo: finalGenesisEndSubDaoEpochInfo,
            },
          } = await program.methods
            .delegateV0()
            .accountsPartial({
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

          // Get to the actual expiration epoch and make sure to get an update
          await ffwd(EPOCH_LENGTH * 15);
          // Burn dc to cause an update to subdao epoch info
          await burnDc(1);

          console.log("Checking after delegation expiration");
          await ffwd(EPOCH_LENGTH * 20);
          await burnDc(1);
          subDaoEpochInfo = await getCurrEpochInfo();
          let currTime = subDaoEpochInfo.epoch.toNumber() * EPOCH_LENGTH;
          let timeStaked = currTime - stakeTime.toNumber();
          let expected = 0;
          expect(toNumber(subDaoEpochInfo.vehntAtEpochStart, 8)).to.be.closeTo(
            // Fall rates aren't a perfect measurement, we divide the total fall of the position by
            // the total time staked. Imagine the total fall was 1 and the total time was 3. We would have
            // a fall rate of 0.3333333333333333 and could never have enough decimals to represent it
            expected,
            0.0000001
          );

          console.log("Checking genesis end");
          await ffwd(EPOCH_LENGTH * 1460);
          await burnDc(1);
          subDaoEpochInfo = await getCurrEpochInfo();
          currTime = subDaoEpochInfo.epoch.toNumber() * EPOCH_LENGTH;
          timeStaked = currTime - stakeTime.toNumber();
          expected = 0;
          expect(toNumber(subDaoEpochInfo.vehntAtEpochStart, 8)).to.be.closeTo(
            expected,
            0.0000001
          );

          console.log("Checking after genesis end");
          await ffwd(EPOCH_LENGTH * 1461);
          await burnDc(1);
          subDaoEpochInfo = await getCurrEpochInfo();
          currTime = subDaoEpochInfo.epoch.toNumber() * EPOCH_LENGTH;
          timeStaked = currTime - stakeTime.toNumber();
          expected = 0;
          expect(toNumber(subDaoEpochInfo.vehntAtEpochStart, 8)).to.be.closeTo(
            expected,
            0.0000001
          );

          console.log("Checking at expiry");
          const unixTime = Number(await getUnixTimestamp(provider));
          const expiryOffset =
            stakeTime.toNumber() + EPOCH_LENGTH * 1460 - unixTime;
          await ffwd(expiryOffset);
          await burnDc(1);
          subDaoEpochInfo = await getCurrEpochInfo();
          currTime = subDaoEpochInfo.epoch.toNumber() * EPOCH_LENGTH;
          timeStaked = currTime - stakeTime.toNumber();
          expected = 0;
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
});
