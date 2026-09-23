import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";
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
import { NftProxy } from "@helium/modular-governance-idls/lib/types/nft_proxy";
import { Proposal } from "@helium/modular-governance-idls/lib/types/proposal";
import { init as initProxy } from "@helium/nft-proxy-sdk";
import { init as initBurn } from "@helium/no-emit-sdk";
import { init as initProposal } from "@helium/proposal-sdk";
import {
  HNT_PYTH_PRICE_FEED,
  createAtaAndMint,
  createAtaAndTransfer,
  createMint,
  sendInstructions,
  toBN,
  toNumber,
} from "@helium/spl-utils";
import {
  AccountLayout,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import BN from "bn.js";
import chai, { assert, expect } from "chai";
import chaiAsPromised from "chai-as-promised";
// @ts-ignore
import bs58 from "bs58";
import {
  init as dcInit,
  mintDataCredits,
} from "../../packages/data-credits-sdk/src";
import {
  init as issuerInit,
  onboardIotHotspot,
} from "../../packages/helium-entity-manager-sdk/src";
import { init as initHSD } from "../../packages/helium-sub-daos-sdk/src";
import { init as vsrInit } from "../../packages/voter-stake-registry-sdk/src";
import { DataCredits } from "../../target/types/data_credits";
import { HeliumEntityManager } from "../../target/types/helium_entity_manager";
import { NoEmit } from "../../target/types/no_emit";
import { createMockCompression } from "./compression";
import { initTestSubdao } from "./daos";
import { burnDataCredits } from "./data-credits";
import { expectBnAccuracy } from "./expectBnAccuracy";
import {
  ensureDCIdl,
  ensureHSDIdl,
  ensureVSRIdl,
  initTestMaker,
  initTestRewardableEntityConfig,
  initWorld,
} from "./fixtures";
import { loadKeypair } from "./solana";
import { random } from "./string";
import { createPosition, initVsr } from "./vsr";

chai.use(chaiAsPromised);

const THREAD_PID = new PublicKey(
  "CLoCKyJ6DXBJqqu2VWx9RLbgnwwR6BMHHuyasVmfMzBh",
);

export const EPOCH_REWARDS = 100000000;
export const EPOCH_REWARDS_PLUS_NET_EMISSIONS =
  EPOCH_REWARDS + Math.floor((6 / 7) * 300);
const SUB_DAO_EPOCH_REWARDS = 10000000;
const SECS_PER_DAY = 86400;
const SECS_PER_YEAR = 365 * SECS_PER_DAY;
const MAX_LOCKUP = 4 * SECS_PER_YEAR;
const SCALE = 100;
export const NOT_EMITTED_AMOUNT = 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

export const provider = anchor.getProvider() as anchor.AnchorProvider;
export const me = provider.wallet.publicKey;

/**
 * Everything the helium-sub-daos suites share. The fields are filled in by the
 * hooks `useSubDaoPrograms` and `useDaoAndSubDaoWorld` register, so a shard file
 * reads them from the context rather than from a closure it does not own.
 */
export interface SubDaoTestContext {
  program: Program<HeliumSubDaos>;
  dcProgram: Program<DataCredits>;
  noEmitProgram: Program<NoEmit>;
  hemProgram: Program<HeliumEntityManager>;
  cbProgram: Program<CircuitBreaker>;
  vsrProgram: Program<VoterStakeRegistry>;
  proxyProgram: Program<NftProxy>;
  proposalProgram: Program<Proposal>;

  registrar: PublicKey;
  position: PublicKey;
  vault: PublicKey;
  hntMint: PublicKey;
  positionAuthorityKp: Keypair;

  dao: PublicKey;
  subDao: PublicKey;
  treasury: PublicKey;
  hstPool: PublicKey;
  dcMint: PublicKey;
  rewardsEscrow: PublicKey;

  genesisVotePowerMultiplierExpirationTs: number;
  proxySeasonEnd: BN;
  initialSupply: BN;

  burnDc: (amount: number) => Promise<{ subDaoEpochInfo: PublicKey }>;
  depositIntoPosition: (
    position: PublicKey,
    amountHnt: number,
  ) => Promise<void>;
}

/** Registers the `before` that inits every program, and returns the context. */
export const useSubDaoPrograms = (): SubDaoTestContext => {
  // The program handles and the per-test world are assigned by the hooks below.
  const ctx = {
    genesisVotePowerMultiplierExpirationTs: 1,
    proxySeasonEnd: new BN(
      new Date().valueOf() / 1000 + 24 * 60 * 60 * 5 * 365,
    ),
    initialSupply: toBN(223_000_000, 8),
  } as SubDaoTestContext;

  // A delegation is sized when it is made; later deposits into the position are not part of it.
  async function depositIntoPosition(position: PublicKey, amountHnt: number) {
    const depositor = Keypair.generate();
    const amount = toBN(amountHnt, 8);
    await createAtaAndTransfer(
      provider,
      ctx.hntMint,
      amount,
      me,
      depositor.publicKey,
    );
    await ctx.vsrProgram.methods
      .depositV0({ amount })
      .accountsPartial({
        registrar: ctx.registrar,
        position,
        mint: ctx.hntMint,
        depositAuthority: depositor.publicKey,
      })
      .signers([depositor])
      .rpc({ skipPreflight: true });
  }

  async function burnDc(
    amount: number,
  ): Promise<{ subDaoEpochInfo: PublicKey }> {
    await provider.sendAll(
      (
        await mintDataCredits({
          program: ctx.dcProgram,
          hntAmount: toBN(amount, 8),
          dcMint: ctx.dcMint,
        })
      ).txs,
    );

    await sendInstructions(provider, [
      SystemProgram.transfer({
        fromPubkey: me,
        toPubkey: PublicKey.findProgramAddressSync(
          [Buffer.from("account_payer", "utf8")],
          ctx.dcProgram.programId,
        )[0],
        lamports: 100000000,
      }),
    ]);

    return burnDataCredits({
      program: ctx.dcProgram,
      subDao: ctx.subDao,
      amount,
    });
  }

  ctx.burnDc = burnDc;
  ctx.depositIntoPosition = depositIntoPosition;

  before(async () => {
    ctx.program = await initHSD(
      provider,
      anchor.workspace.HeliumSubDaos.programId,
      anchor.workspace.HeliumSubDaos.idl,
    );
    ctx.dcProgram = await dcInit(
      provider,
      anchor.workspace.DataCredits.programId,
      anchor.workspace.DataCredits.idl,
    );
    ctx.noEmitProgram = await initBurn(
      provider,
      anchor.workspace.NoEmit.programId,
      anchor.workspace.NoEmit.idl,
    );
    ctx.cbProgram = await cbInit(
      provider,
      anchor.workspace.CircuitBreaker.programId,
      anchor.workspace.CircuitBreaker.idl,
    );
    ensureDCIdl();
    ensureHSDIdl();
    ctx.hemProgram = await issuerInit(
      provider,
      anchor.workspace.HeliumEntityManager.programId,
      anchor.workspace.HeliumEntityManager.idl,
    );
    ctx.proxyProgram = await initProxy(provider);

    ctx.vsrProgram = await vsrInit(
      provider,
      anchor.workspace.VoterStakeRegistry.programId,
      anchor.workspace.VoterStakeRegistry.idl,
    );
    ensureVSRIdl();

    ctx.proposalProgram = await initProposal(provider);
  });

  return ctx;
};

/** Registers the `beforeEach` that builds a fresh dao + subdao world. */
export const useDaoAndSubDaoWorld = (ctx: SubDaoTestContext) => {
  beforeEach(async () => {
    ctx.positionAuthorityKp = Keypair.generate();
    ctx.hntMint = await createMint(provider, 8, me, me);
    await createAtaAndMint(provider, ctx.hntMint, ctx.initialSupply);
    await createAtaAndTransfer(
      provider,
      ctx.hntMint,
      toBN(100000000, 8),
      me,
      ctx.positionAuthorityKp.publicKey,
    );
    await provider.connection.requestAirdrop(
      ctx.positionAuthorityKp.publicKey,
      LAMPORTS_PER_SOL,
    );
    console.log(`Genesis: ${ctx.genesisVotePowerMultiplierExpirationTs}`);

    ({ registrar: ctx.registrar } = await initVsr(
      ctx.vsrProgram,
      ctx.proxyProgram,
      provider,
      me,
      ctx.hntMint,
      daoKey(ctx.hntMint)[0],
      ctx.genesisVotePowerMultiplierExpirationTs,
      3,
      ctx.proxySeasonEnd,
    ));

    ({
      dataCredits: { dcMint: ctx.dcMint },
      subDao: { subDao: ctx.subDao, treasury: ctx.treasury },
      dao: { dao: ctx.dao, rewardsEscrow: ctx.rewardsEscrow },
    } = await initWorld(
      provider,
      ctx.hemProgram,
      ctx.program,
      ctx.dcProgram,
      EPOCH_REWARDS,
      SUB_DAO_EPOCH_REWARDS,
      ctx.registrar,
      ctx.hntMint,
    ));
    ctx.hstPool = (await ctx.program.account.daoV0.fetch(ctx.dao)).hstPool;
  });
};

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

type VehntCase = (typeof vehntOptions)[number];

const describeVehntCase = (
  ctx: SubDaoTestContext,
  { name, options }: VehntCase,
) => {
  describe("vehnt tests - " + name, () => {
    before(() => {
      ctx.genesisVotePowerMultiplierExpirationTs = 1;
    });

    beforeEach(async () => {
      ({ position: ctx.position, vault: ctx.vault } = await createPosition(
        ctx.vsrProgram,
        provider,
        ctx.registrar,
        ctx.hntMint,
        options,
        ctx.positionAuthorityKp,
      ));
    });

    it("allows vehnt delegation", async () => {
      const lockupAmount = toBN(options.lockupAmount, 8);
      const method = ctx.program.methods
        .delegateV0()
        .accountsPartial({
          position: ctx.position,
          subDao: ctx.subDao,
          positionAuthority: ctx.positionAuthorityKp.publicKey,
        })
        .signers([ctx.positionAuthorityKp]);
      const { delegatedPosition } = await method.pubkeys();
      await method.rpc({ skipPreflight: true });

      const acc = await ctx.program.account.delegatedPositionV0.fetch(
        delegatedPosition!,
      );
      const sdAcc = await ctx.program.account.subDaoV0.fetch(ctx.subDao);
      const positionAcc = await ctx.vsrProgram.account.positionV0.fetch(
        ctx.position,
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
        typeof options.kind?.constant !== "undefined" ? 0 : 0.00000000001,
      );
      expectBnAccuracy(lockupAmount, acc.hntAmount, 0.01);
    });

    it("calculates subdao rewards", async () => {
      // Onboard one hotspot to add to the utility score
      const { rewardableEntityConfig } = await initTestRewardableEntityConfig(
        ctx.hemProgram,
        ctx.subDao,
      );
      const { maker, collection, makerKeypair, merkle } = await initTestMaker(
        ctx.hemProgram,
        provider,
        rewardableEntityConfig,
        ctx.dao,
      );
      const eccVerifier = loadKeypair(
        __dirname + "/../keypairs/verifier-test.json",
      );
      const ecc = (await HeliumKeypair.makeRandom()).address.b58;
      const hotspotOwner = Keypair.generate();

      const { getAssetFn, getAssetProofFn, hotspot } =
        await createMockCompression({
          collection,
          dao: ctx.dao,
          merkle,
          ecc,
          hotspotOwner: hotspotOwner.publicKey,
        });
      const issueMethod = ctx.hemProgram.methods
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
          dao: ctx.dao,
          eccVerifier: eccVerifier.publicKey,
        })
        .signers([makerKeypair, eccVerifier]);

      await issueMethod.rpc({ skipPreflight: true });
      await provider.sendAll(
        (
          await mintDataCredits({
            program: ctx.dcProgram,
            dcAmount: toBN(60, 5),
            dcMint: ctx.dcMint,
          })
        ).txs,
      );

      const method = (
        await onboardIotHotspot({
          program: ctx.hemProgram,
          assetId: hotspot,
          maker,
          dao: ctx.dao,
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

      await ctx.hemProgram.methods
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

      const { subDaoEpochInfo } = await ctx.burnDc(1600000);
      const epoch = (
        await ctx.program.account.subDaoEpochInfoV0.fetch(subDaoEpochInfo)
      ).epoch;

      // delegate some vehnt
      await ctx.program.methods
        .delegateV0()
        .accountsPartial({
          position: ctx.position,
          subDao: ctx.subDao,
          positionAuthority: ctx.positionAuthorityKp.publicKey,
        })
        .signers([ctx.positionAuthorityKp])
        .rpc({ skipPreflight: true });

      const instr = ctx.program.methods
        .calculateUtilityScoreV0({
          epoch,
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
        ])
        .accountsPartial({
          subDao: ctx.subDao,
          dao: ctx.dao,
          hntPriceOracle: null,
        });

      const pubkeys = await instr.pubkeys();
      await instr.rpc({
        skipPreflight: true,
        commitment: "confirmed",
      });

      const subDaoInfo =
        await ctx.program.account.subDaoEpochInfoV0.fetch(subDaoEpochInfo);
      const daoInfo = await ctx.program.account.daoEpochInfoV0.fetch(
        pubkeys.daoEpochInfo!,
      );

      expect(daoInfo.numUtilityScoresCalculated).to.eq(1);

      const supply = (await getMint(provider.connection, ctx.hntMint)).supply;
      const veHnt = toNumber(subDaoInfo.vehntAtEpochStart, 8);
      const totalUtility = veHnt;
      expect(daoInfo.totalRewards.toString()).to.eq(
        EPOCH_REWARDS_PLUS_NET_EMISSIONS.toString(),
      );
      expect(daoInfo.currentHntSupply.toString()).to.eq(
        new BN(supply.toString())
          .add(new BN(EPOCH_REWARDS_PLUS_NET_EMISSIONS))
          .toString(),
      );

      expectBnAccuracy(
        toBN(totalUtility, 12),
        daoInfo.totalUtilityScore,
        0.00000002,
      );
      expectBnAccuracy(
        toBN(totalUtility, 12),
        subDaoInfo.utilityScore!,
        0.00000002,
      );
    });

    it("allows transfers", async () => {
      const { position: newPos } = await createPosition(
        ctx.vsrProgram,
        provider,
        ctx.registrar,
        ctx.hntMint,
        options,
        ctx.positionAuthorityKp,
      );
      await ctx.program.methods
        .transferV0({ amount: toBN(10, 8) })
        .accountsPartial({
          sourcePosition: ctx.position,
          targetPosition: newPos,
          depositMint: ctx.hntMint,
          positionAuthority: ctx.positionAuthorityKp.publicKey,
        })
        .signers([ctx.positionAuthorityKp])
        .rpc();
    });

    it("allows lockup resets", async () => {
      await ctx.program.methods
        .resetLockupV0({
          kind: { constant: {} },
          periods: 365 * 4,
        })
        .accountsPartial({
          dao: ctx.dao,
          position: ctx.position,
          positionAuthority: ctx.positionAuthorityKp.publicKey,
        })
        .signers([ctx.positionAuthorityKp])
        .rpc();
    });

    describe("with delegated vehnt", () => {
      beforeEach(async () => {
        await ctx.program.methods
          .delegateV0()
          .accountsPartial({
            position: ctx.position,
            subDao: ctx.subDao,
            positionAuthority: ctx.positionAuthorityKp.publicKey,
          })
          .signers([ctx.positionAuthorityKp])
          .rpc({ skipPreflight: true });
      });

      it("allows changing delegation", async () => {
        const newSubDaoInfo = await initTestSubdao({
          hsdProgram: ctx.program,
          provider,
          authority: provider.wallet.publicKey,
          dao: ctx.dao,
          epochRewards: 100,
          numTokens: new BN(0),
        });
        await ctx.vsrProgram.methods
          .setTimeOffsetV0(new BN(EPOCH_LENGTH * 5))
          .accountsPartial({ registrar: ctx.registrar })
          .rpc({ skipPreflight: true });
        const method = await ctx.program.methods
          .changeDelegationV0()
          .accountsPartial({
            position: ctx.position,
            oldSubDao: ctx.subDao,
            subDao: newSubDaoInfo.subDao,
            positionAuthority: ctx.positionAuthorityKp.publicKey,
          })
          .signers([ctx.positionAuthorityKp]);

        const { delegatedPosition, oldSubDao } = await method.pubkeys();
        const oldDelegatedPositionAcc =
          await ctx.program.account.delegatedPositionV0.fetch(
            delegatedPosition!,
          );
        await method.rpc({ skipPreflight: true });

        const newDelegatedPositionAcc =
          await ctx.program.account.delegatedPositionV0.fetch(
            delegatedPosition!,
          );
        expect(oldDelegatedPositionAcc.lastClaimedEpoch.toNumber()).to.eq(
          newDelegatedPositionAcc.lastClaimedEpoch.toNumber(),
        );
        expect(oldDelegatedPositionAcc.claimedEpochsBitmap.toString()).to.eq(
          newDelegatedPositionAcc.claimedEpochsBitmap.toString(),
        );

        const oldSdAcc = await ctx.program.account.subDaoV0.fetch(oldSubDao!);

        expect(oldSdAcc.vehntFallRate.toNumber()).to.eq(0);
        expect(
          oldSdAcc.vehntDelegated.toNumber() / 1000000000000,
        ).to.be.closeTo(0, 15);

        const newSdAcc = await ctx.program.account.subDaoV0.fetch(
          newSubDaoInfo.subDao,
        );
        const positionAcc = await ctx.vsrProgram.account.positionV0.fetch(
          ctx.position,
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
          typeof options.kind?.constant !== "undefined" ? 0 : 0.00000000001,
        );
      });

      it("does not allow transfers", async () => {
        const { position: newPos } = await createPosition(
          ctx.vsrProgram,
          provider,
          ctx.registrar,
          ctx.hntMint,
          options,
          ctx.positionAuthorityKp,
        );
        await expect(
          ctx.program.methods
            .transferV0({ amount: toBN(10, 8) })
            .accountsPartial({
              sourcePosition: ctx.position,
              targetPosition: newPos,
              depositMint: ctx.hntMint,
              positionAuthority: ctx.positionAuthorityKp.publicKey,
            })
            .signers([ctx.positionAuthorityKp])
            .rpc(),
        ).to.eventually.be.rejectedWith(
          "AnchorError caused by account: source_delegated_position. Error Code: PositionChangeWhileDelegated. Error Number: 6014. Error Message: Cannot change a position while it is delegated.",
        );
      });

      it("does not allow lockup resets", async () => {
        await expect(
          ctx.program.methods
            .resetLockupV0({
              kind: { constant: {} },
              periods: 182 * 4,
            })
            .accountsPartial({
              dao: ctx.dao,
              position: ctx.position,
              positionAuthority: ctx.positionAuthorityKp.publicKey,
            })
            .signers([ctx.positionAuthorityKp])
            .rpc(),
        ).to.eventually.be.rejectedWith(
          "AnchorError caused by account: delegated_position. Error Code: PositionChangeWhileDelegated. Error Number: 6014. Error Message: Cannot change a position while it is delegated.",
        );
      });

      it("allows closing delegate", async () => {
        await sleep(options.delay);
        const method = ctx.program.methods
          .closeDelegationV0()
          .accountsPartial({
            position: ctx.position,
            subDao: ctx.subDao,
            positionAuthority: ctx.positionAuthorityKp.publicKey,
          })
          .signers([ctx.positionAuthorityKp]);

        const { delegatedPosition, subDaoEpochInfo } = await method.pubkeys();
        await method.rpc({ skipPreflight: true });

        const sdAcc = await ctx.program.account.subDaoV0.fetch(ctx.subDao);

        expect(sdAcc.vehntFallRate.toNumber()).to.eq(0);
        // Extremely precise u128 can be off by dust.
        expect(sdAcc.vehntDelegated.toNumber()).to.be.closeTo(0, 15);

        assert.isFalse(
          !!(await provider.connection.getAccountInfo(delegatedPosition!)),
        );
      });

      describe("backstop cap redirect", () => {
        it("redirects data-bucket overflow above the cap to the delegator pool", async () => {
          await ctx.vsrProgram.methods
            .setTimeOffsetV0(new BN(1 * 60 * 60 * 24))
            .accountsPartial({ registrar: ctx.registrar })
            .rpc({ skipPreflight: true });

          // Tiny carrier burn => a very low 3x earnings ceiling, so almost the
          // entire Mobile data bucket sits above the cap and must overflow to
          // stakers (escrow -> delegator pool) in issue_rewards_v0.
          const { subDaoEpochInfo } = await ctx.burnDc(10);
          const epoch = (
            await ctx.program.account.subDaoEpochInfoV0.fetch(subDaoEpochInfo)
          ).epoch;

          await ctx.program.methods
            .calculateUtilityScoreV0({ epoch })
            .preInstructions([
              ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
            ])
            .accountsPartial({
              subDao: ctx.subDao,
              dao: ctx.dao,
              hntPriceOracle: HNT_PYTH_PRICE_FEED,
            })
            .rpc({ skipPreflight: true });

          await ctx.program.methods
            .issueRewardsV0({ epoch })
            .accountsPartial({
              subDao: ctx.subDao,
              supplementVault: null,
              councilVault: null,
            })
            .rpc({ skipPreflight: true });

          const acc =
            await ctx.program.account.subDaoEpochInfoV0.fetch(subDaoEpochInfo);
          // Cap binding hard: the redirected overflow makes the delegator-pool
          // mint exceed the trimmed rewards escrow (normally escrow >> the 6%
          // delegator slice), proving the escrow->delegator redirect fired.
          expect(acc.delegationRewardsIssued.toNumber()).to.be.greaterThan(
            acc.hntRewardsIssued.toNumber(),
          );
          expect(acc.hntRewardsIssued.toNumber()).to.be.greaterThan(0);
        });
      });

      describe("backstop floor delivery", () => {
        it("tops deployers up to the price-derived 0.8x-carrier target", async () => {
          // Set net_emissions_cap = 0 so the top-up's burn budget is just
          // smoothed_hnt_burned; then a real HNT burn (below) makes that budget far
          // exceed demand, so the top-up is the full price-derived amount (unclamped).
          await ctx.program.methods
            .updateDaoV0({
              authority: null,
              emissionSchedule: null,
              hstEmissionSchedule: null,
              hstPool: null,
              netEmissionsCap: new BN(0),
              proposalNamespace: null,
              delegatorRewardsPercent: null,
              rewardsEscrow: null,
            })
            .accountsPartial({ dao: ctx.dao })
            .rpc({ skipPreflight: true });

          // Epoch 1: calculate to record supply and give the sub-DAO a utility score
          // (so epoch 2's bootstrap sets a non-zero Mobile percent share).
          await ctx.vsrProgram.methods
            .setTimeOffsetV0(new BN(1 * 60 * 60 * 24))
            .accountsPartial({ registrar: ctx.registrar })
            .rpc({ skipPreflight: true });
          const epoch1 = (await ctx.burnDc(1)).subDaoEpochInfo;
          const e1 = (await ctx.program.account.subDaoEpochInfoV0.fetch(epoch1))
            .epoch;
          await ctx.program.methods
            .calculateUtilityScoreV0({ epoch: e1 })
            .preInstructions([
              ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
            ])
            .accountsPartial({
              subDao: ctx.subDao,
              dao: ctx.dao,
              hntPriceOracle: HNT_PYTH_PRICE_FEED,
            })
            .rpc({ skipPreflight: true });

          // Epoch 2: a large carrier burn drives a 0.8x-carrier target well above the
          // deployer baseline, and burns ~100k HNT so smoothed_hnt_burned (the budget)
          // dwarfs demand. The same Mobile sub-DAO epoch-info account is its prev next.
          await ctx.vsrProgram.methods
            .setTimeOffsetV0(new BN(2 * 60 * 60 * 24))
            .accountsPartial({ registrar: ctx.registrar })
            .rpc({ skipPreflight: true });
          const { subDaoEpochInfo } = await ctx.burnDc(100000);
          const epoch = (
            await ctx.program.account.subDaoEpochInfoV0.fetch(subDaoEpochInfo)
          ).epoch;

          const calc = () =>
            ctx.program.methods
              .calculateUtilityScoreV0({ epoch })
              .preInstructions([
                ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
              ])
              .accountsPartial({
                subDao: ctx.subDao,
                dao: ctx.dao,
                hntPriceOracle: HNT_PYTH_PRICE_FEED,
              });
          const { daoEpochInfo, prevSubDaoEpochInfo } = await calc().pubkeys();
          // First pass bootstraps the prev-epoch Mobile share to non-zero; recalc
          // (TESTING) then sizes the top-up against it.
          await calc().rpc({ skipPreflight: true });
          await calc().rpc({ skipPreflight: true });

          // Issue, so the assertions read the escrow mint the deployers are paid from
          // rather than a share of total_rewards computed in the test.
          await ctx.program.methods
            .issueRewardsV0({ epoch })
            .accountsPartial({
              subDao: ctx.subDao,
              supplementVault: null,
              councilVault: null,
            })
            .rpc({ skipPreflight: true });

          const di = await ctx.program.account.daoEpochInfoV0.fetch(
            daoEpochInfo!,
          );
          const sdi =
            await ctx.program.account.subDaoEpochInfoV0.fetch(subDaoEpochInfo);
          const mobileShare = (
            await ctx.program.account.subDaoEpochInfoV0.fetch(
              prevSubDaoEpochInfo,
            )
          ).previousPercentage;

          // net_emissions_cap is 0 above, so the amount still divided by sub-DAO share
          // and bucket is the bare emission schedule and the rest of total_rewards is
          // the top-up -- which is exactly how issue_rewards_v0 recovers it.
          const topUp = di.totalRewards.toNumber() - EPOCH_REWARDS;
          expect(topUp).to.be.greaterThan(0);

          // deployer_cap_hnt is 3x carrier-paid USD converted at the EMA point price;
          // the floor target is 0.8x converted at the lower-bound price (ema - 2*conf).
          // So target == (cap / 3.75) x (ema / price_lower), not simply cap / 3.75 (the
          // two coincide only at zero confidence). Read the cloned mainnet price to
          // reconstruct the ratio.
          const pythReceiver = new PythSolanaReceiver({
            connection: provider.connection,
            wallet: provider.wallet as any,
          });
          const priceAcc =
            await pythReceiver.fetchPriceUpdateAccount(HNT_PYTH_PRICE_FEED);
          const emaPrice = priceAcc!.priceMessage.emaPrice.toNumber();
          const emaConf = priceAcc!.priceMessage.emaConf.toNumber();
          const priceLower = emaPrice - 2 * emaConf;
          const target =
            (di.deployerCapHnt.toNumber() / 3.75) * (emaPrice / priceLower);

          expect(mobileShare).to.be.greaterThan(0);
          // The escrow mint is the split base less the delegation slice, plus the whole
          // top-up, and that is what has to land on the target.
          expect(sdi.hntRewardsIssued.toNumber()).to.be.closeTo(
            target,
            target * 0.02,
          );
          // The top-up takes no delegator cut: the delegation mint is 6% of the split
          // base alone, not of the split base plus the top-up.
          expect(sdi.delegationRewardsIssued.toNumber()).to.be.closeTo(
            EPOCH_REWARDS * 0.06,
            EPOCH_REWARDS * 0.06 * 0.02,
          );
        });
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
            ctx.vsrProgram,
            provider,
            ctx.registrar,
            ctx.hntMint,
            basePositionOptions,
            ctx.positionAuthorityKp,
          ));

          await ctx.program.methods
            .delegateV0()
            .accountsPartial({
              position: basePosition,
              subDao: ctx.subDao,
              positionAuthority: ctx.positionAuthorityKp.publicKey,
            })
            .signers([ctx.positionAuthorityKp])
            .rpc({ skipPreflight: true });
        });

        it("delegates proper vehnt amount", async () => {
          const sdAcc = await ctx.program.account.subDaoV0.fetch(ctx.subDao);

          const expectedVehnt =
            options.lockupAmount * options.expectedMultiplier +
            basePositionOptions.lockupAmount *
              basePositionOptions.expectedMultiplier;

          expectBnAccuracy(
            toBN(expectedVehnt, 8).mul(new BN("1000000000000")),
            sdAcc.vehntDelegated,
            0.0000001,
          );
        });

        it("allows closing delegate", async () => {
          const method = ctx.program.methods
            .closeDelegationV0()
            .accountsPartial({
              position: basePosition,
              subDao: ctx.subDao,
              positionAuthority: ctx.positionAuthorityKp.publicKey,
            })
            .signers([ctx.positionAuthorityKp]);

          const { delegatedPosition } = await method.pubkeys();
          await method.rpc({ skipPreflight: true });

          const sdAcc = await ctx.program.account.subDaoV0.fetch(ctx.subDao);
          const positionAcc = await ctx.vsrProgram.account.positionV0.fetch(
            ctx.position,
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
            0.0000000001,
          );

          expect(sdAcc.vehntFallRate.toNumber()).to.be.closeTo(
            typeof positionAcc.lockup.kind.cliff !== "undefined"
              ? ((options.lockupAmount * options.expectedMultiplier) /
                  (endTs - startTs)) *
                  100000000000000000000
              : 0,
            1,
          );

          assert.isFalse(
            !!(await provider.connection.getAccountInfo(delegatedPosition!)),
          );
        });

        it("closes a delegation at the delegated amount", async () => {
          await ctx.depositIntoPosition(
            basePosition,
            basePositionOptions.lockupAmount * 10,
          );

          await ctx.program.methods
            .closeDelegationV0()
            .accountsPartial({
              position: basePosition,
              subDao: ctx.subDao,
              positionAuthority: ctx.positionAuthorityKp.publicKey,
            })
            .signers([ctx.positionAuthorityKp])
            .rpc({ skipPreflight: true });

          // Only `position` is still delegated, so the sub-DAO carries exactly its veHNT.
          const sdAcc = await ctx.program.account.subDaoV0.fetch(ctx.subDao);
          const positionAcc = await ctx.vsrProgram.account.positionV0.fetch(
            ctx.position,
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
            0.0000000001,
          );
          expect(sdAcc.vehntFallRate.toNumber()).to.be.closeTo(
            typeof positionAcc.lockup.kind.cliff !== "undefined"
              ? ((options.lockupAmount * options.expectedMultiplier) /
                  (endTs - startTs)) *
                  100000000000000000000
              : 0,
            1,
          );
        });
      });

      describe("with calculated rewards", () => {
        let epoch: anchor.BN;
        let subDaoEpochInfo: PublicKey;

        beforeEach(async () => {
          await ctx.vsrProgram.methods
            .setTimeOffsetV0(new BN(1 * 60 * 60 * 24))
            .accountsPartial({ registrar: ctx.registrar })
            .rpc({ skipPreflight: true });

          ({ subDaoEpochInfo } = await ctx.burnDc(1600000));
          epoch = (
            await ctx.program.account.subDaoEpochInfoV0.fetch(subDaoEpochInfo)
          ).epoch;

          await ctx.program.methods
            .calculateUtilityScoreV0({
              epoch,
            })
            .preInstructions([
              ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
            ])
            .accountsPartial({
              subDao: ctx.subDao,
              dao: ctx.dao,
              hntPriceOracle: null,
            })
            .rpc({ skipPreflight: true });
        });

        it("issues hnt rewards to subdaos, dnt to rewards escrow, and hst to hst pool", async () => {
          const preTreasuryBalance = AccountLayout.decode(
            (await provider.connection.getAccountInfo(ctx.treasury))?.data!,
          ).amount;
          const preHstBalance = AccountLayout.decode(
            (await provider.connection.getAccountInfo(ctx.hstPool))?.data!,
          ).amount;
          const preHntBalance = AccountLayout.decode(
            (await provider.connection.getAccountInfo(ctx.rewardsEscrow))
              ?.data!,
          ).amount;
          await ctx.program.methods
            .issueRewardsV0({
              epoch,
            })
            .accountsPartial({
              subDao: ctx.subDao,
              supplementVault: null,
              councilVault: null,
            })
            .rpc({ skipPreflight: true });

          const postTreasuryBalance = AccountLayout.decode(
            (await provider.connection.getAccountInfo(ctx.treasury))?.data!,
          ).amount;
          const postHntBalance = AccountLayout.decode(
            (await provider.connection.getAccountInfo(ctx.rewardsEscrow))
              ?.data!,
          ).amount;
          const postHstBalance = AccountLayout.decode(
            (await provider.connection.getAccountInfo(ctx.hstPool))?.data!,
          ).amount;
          expect(Number(postHntBalance - preHntBalance)).to.be.closeTo(
            EPOCH_REWARDS_PLUS_NET_EMISSIONS * (1 - 0.06),
            1, // Allow for 1 unit of difference to handle rounding
          );
          expect((postHstBalance - preHstBalance).toString()).to.eq("0");
          expect((postTreasuryBalance - preTreasuryBalance).toString()).to.eq(
            "0",
          );

          const acc =
            await ctx.program.account.subDaoEpochInfoV0.fetch(subDaoEpochInfo);
          expect(Boolean(acc.rewardsIssuedAt)).to.be.true;
        });

        // Claims are gated on the position having voted on the dao's recent proposals.
        async function voteOnTwoProposals() {
          const {
            pubkeys: { proposalConfig },
          } = await ctx.proposalProgram.methods
            .initializeProposalConfigV0({
              name: random(10),
              voteController: ctx.registrar,
              stateController: me,
              onVoteHook: PublicKey.default,
              authority: me,
            })
            .rpcAndKeys({ skipPreflight: true });
          for (let i = 0; i < 2; i++) {
            const proposalName = `Proposal ${random(10)}`;
            const {
              pubkeys: { proposal },
            } = await ctx.proposalProgram.methods
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
            await ctx.proposalProgram.methods
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
            } = await ctx.vsrProgram.methods
              .voteV0({
                choice: 0,
              })
              .accountsPartial({
                position: ctx.position,
                proposal: proposal as PublicKey,
                voter: ctx.positionAuthorityKp.publicKey,
                proposalConfig,
                stateController: me,
                onVoteHook: PublicKey.default,
              })
              .signers([ctx.positionAuthorityKp])
              .rpcAndKeys({ skipPreflight: true });
            // Ensure dao pays resize
            await sendInstructions(provider, [
              SystemProgram.transfer({
                fromPubkey: me,
                toPubkey: ctx.dao,
                lamports: 1000000000,
              }),
            ]);
            await ctx.program.methods
              .addRecentProposalToDaoV0()
              .accountsStrict({
                dao: ctx.dao!,
                proposal: proposal!,
              })
              .rpc({ skipPreflight: true });
          }
        }

        it("claim rewards", async () => {
          await voteOnTwoProposals();
          // issue rewards
          await sendInstructions(provider, [
            await ctx.program.methods
              .issueRewardsV0({
                epoch,
              })
              .accountsPartial({
                subDao: ctx.subDao,
                supplementVault: null,
                councilVault: null,
              })
              .instruction(),
          ]);

          const method = ctx.program.methods
            .claimRewardsV1({
              epoch,
            })
            .accountsPartial({
              position: ctx.position,
              subDao: ctx.subDao,
              payer: ctx.positionAuthorityKp.publicKey,
              positionAuthority: ctx.positionAuthorityKp.publicKey,
            })
            .signers([ctx.positionAuthorityKp]);
          const { delegatorAta } = await method.pubkeys();
          const preAtaBalance = AccountLayout.decode(
            (await provider.connection.getAccountInfo(delegatorAta!))?.data!,
          ).amount;
          await method.rpc({ skipPreflight: true });

          const postAtaBalance = AccountLayout.decode(
            (await provider.connection.getAccountInfo(delegatorAta!))?.data!,
          ).amount;
          expect(Number(postAtaBalance) - Number(preAtaBalance)).to.be.within(
            EPOCH_REWARDS_PLUS_NET_EMISSIONS *
              (delegatorRewardsPercent(6).toNumber() / 10_000000000) -
              5,
            EPOCH_REWARDS_PLUS_NET_EMISSIONS *
              (delegatorRewardsPercent(6).toNumber() / 10_000000000) +
              5,
          );
        });

        it("pays rewards on the delegated amount", async () => {
          await voteOnTwoProposals();
          await sendInstructions(provider, [
            await ctx.program.methods
              .issueRewardsV0({
                epoch,
              })
              .accountsPartial({
                subDao: ctx.subDao,
                supplementVault: null,
                councilVault: null,
              })
              .instruction(),
          ]);

          // Fund the pool well above one epoch's delegator share so the claim is not capped
          // by the pool balance.
          const daoAcc = await ctx.program.account.daoV0.fetch(ctx.dao);
          await sendInstructions(provider, [
            createTransferInstruction(
              getAssociatedTokenAddressSync(ctx.hntMint, me),
              daoAcc.delegatorPool,
              me,
              BigInt(EPOCH_REWARDS_PLUS_NET_EMISSIONS) * BigInt(20),
            ),
          ]);
          await ctx.depositIntoPosition(
            ctx.position,
            options.lockupAmount * 10,
          );

          const method = ctx.program.methods
            .claimRewardsV1({
              epoch,
            })
            .accountsPartial({
              position: ctx.position,
              subDao: ctx.subDao,
              payer: ctx.positionAuthorityKp.publicKey,
              positionAuthority: ctx.positionAuthorityKp.publicKey,
            })
            .signers([ctx.positionAuthorityKp]);
          const { delegatorAta } = await method.pubkeys();
          const preAtaBalance = AccountLayout.decode(
            (await provider.connection.getAccountInfo(delegatorAta!))?.data!,
          ).amount;
          await method.rpc({ skipPreflight: true });
          const postAtaBalance = AccountLayout.decode(
            (await provider.connection.getAccountInfo(delegatorAta!))?.data!,
          ).amount;

          expect(Number(postAtaBalance) - Number(preAtaBalance)).to.be.within(
            EPOCH_REWARDS_PLUS_NET_EMISSIONS *
              (delegatorRewardsPercent(6).toNumber() / 10_000000000) -
              5,
            EPOCH_REWARDS_PLUS_NET_EMISSIONS *
              (delegatorRewardsPercent(6).toNumber() / 10_000000000) +
              5,
          );
        });
      });
    });
  });
};

/**
 * Registers the parameterized veHNT suite for the named cases. The cases are
 * split across shard files, so an unknown name has to fail loudly rather than
 * silently drop a suite.
 */
export const describeVehntCases = (ctx: SubDaoTestContext, names: string[]) => {
  names.forEach((name) => {
    const vehntCase = vehntOptions.find((option) => option.name === name);
    if (!vehntCase) {
      throw new Error(`Unknown vehnt case: ${name}`);
    }
    describeVehntCase(ctx, vehntCase);
  });
};
