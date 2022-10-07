import { HeliumSubDaos } from "@helium-foundation/idls/lib/types/helium_sub_daos";
import { TestTracker } from "@helium-foundation/idls/lib/types/test_tracker";
import { sendInstructions, toBN } from "@helium-foundation/spl-utils";
import { Keypair as HeliumKeypair } from "@helium/crypto";
import * as anchor from "@project-serum/anchor";
import { BN, Program } from "@project-serum/anchor";
import { AccountLayout } from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import { burnDataCreditsInstructions, init as dcInit, mintDataCreditsInstructions } from "../packages/data-credits-sdk/src";
import { heliumSubDaosResolvers } from "../packages/helium-sub-daos-sdk/src";
import { init as issuerInit } from "../packages/hotspot-issuance-sdk/src";
import { DataCredits } from "../target/types/data_credits";
import { HotspotIssuance } from "../target/types/hotspot_issuance";
import { initTestDao, initTestSubdao } from "./utils/daos";
import { DC_FEE, ensureDCIdl, initWorld } from "./utils/fixtures";
import {
  createAtaAndMint,
  createMint,
  createTestNft,
  mintTo,
} from "./utils/token";

const EPOCH_REWARDS = 100000000;

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
  let issuerProgram: Program<HotspotIssuance>;

  anchor.workspace.TestTracker as Program<TestTracker>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;

  before(async () => {
    dcProgram = await dcInit(
      provider,
      anchor.workspace.DataCredits.programId,
      anchor.workspace.DataCredits.idl
    );
    ensureDCIdl(dcProgram);
    issuerProgram = await issuerInit(
      provider,
      anchor.workspace.HotspotIssuance.programId,
      anchor.workspace.HotspotIssuance.idl
    );
  });

  it("initializes a dao", async () => {
    const { dao, treasury, mint } = await initTestDao(program, provider, EPOCH_REWARDS, provider.wallet.publicKey);
    const account = await program.account.daoV0.fetch(dao!);
    expect(account.authority.toBase58()).eq(me.toBase58());
    expect(account.mint.toBase58()).eq(mint.toBase58());
    expect(account.treasury.toBase58()).eq(treasury!.toBase58());
  });

  it("initializes a subdao", async () => {
    const { dao } = await initTestDao(program, provider, EPOCH_REWARDS, provider.wallet.publicKey);
    const collection = (await createTestNft(provider, me)).mintKey;
    const { subDao, treasury, mint } = await initTestSubdao(
      program,
      provider,
      provider.wallet.publicKey,
      dao,
      collection
    );

    const account = await program.account.subDaoV0.fetch(subDao!);

    expect(account.authority.toBase58()).eq(me.toBase58());
    expect(account.hotspotCollection.toBase58()).eq(collection.toBase58());
    expect(account.treasury.toBase58()).eq(treasury.toBase58());
    expect(account.mint.toBase58()).eq(mint.toBase58());
    expect(account.totalDevices.toNumber()).eq(0);
  });

  describe("with dao and subdao", () => {
    let dao: PublicKey;
    let subDao: PublicKey;
    let hotspotIssuer: PublicKey;
    let treasury: PublicKey;
    let daoTreasury: PublicKey;
    let hntMint: PublicKey;
    let mint: PublicKey;
    let dcMint: PublicKey;
    let onboardingServerKeypair: Keypair;
    let makerKeypair: Keypair;
    let subDaoEpochInfo: PublicKey;

    async function createHospot() {
      const ecc = await(await HeliumKeypair.makeRandom()).address
        .publicKey;
      const hotspotOwner = Keypair.generate().publicKey;

      await sendInstructions(
        provider,
        (
          await mintDataCreditsInstructions({
            provider,
            dcMint,
            program: dcProgram,
            amount: toBN(DC_FEE, 8),
          })
        ).instructions
      );

      const method = await issuerProgram.methods
        .issueHotspotV0({ eccCompact: Buffer.from(ecc) })
        .accounts({
          hotspotIssuer,
          onboardingServer: onboardingServerKeypair.publicKey,
          maker: makerKeypair.publicKey,
          hotspotOwner,
          subDao,
        })
        .signers([onboardingServerKeypair, makerKeypair]);

      subDaoEpochInfo = (await method.pubkeys()).subDaoEpochInfo!;
      await method.rpc({
        skipPreflight: true
      });
    }

    async function burnDc(amount: number): Promise<{ subDaoEpochInfo: PublicKey }> {
      const ix = await burnDataCreditsInstructions({
        program: dcProgram,
        provider,
        amount,
        dcMint,
        subDao,
      });
      await sendInstructions(provider, [
        ...(
          await mintDataCreditsInstructions({
            provider,
            dcMint,
            program: dcProgram,
            amount: toBN(amount, 8),
          })
        ).instructions,
        SystemProgram.transfer({
          fromPubkey: me,
          toPubkey: PublicKey.findProgramAddressSync(
            [Buffer.from("account_payer", "utf8")],
            dcProgram.programId
          )[0],
          lamports: 100000000,
        }),
        ...ix.instructions,
      ]);

      return ix.output
    }

    before(async () => {
      ({
        dataCredits: { dcMint },
        hotspotConfig: { onboardingServerKeypair },
        subDao: { subDao, treasury, mint },
        dao: { dao, treasury: daoTreasury, mint: hntMint },
        issuer: { makerKeypair, hotspotIssuer },
      } = await initWorld(provider, issuerProgram, program, dcProgram));
      await createAtaAndMint(provider, hntMint, toBN(500000000, 8));
    });

    it("allows tracking hotspots", async () => {
      await createHospot();
      const epochInfo = await program.account.subDaoEpochInfoV0.fetch(
        subDaoEpochInfo
      );
      expect(epochInfo.totalDevices.toNumber()).eq(1);
    });

    it("allows tracking dc spend", async () => {
      const { subDaoEpochInfo } = await burnDc(10);

      const epochInfo = await program.account.subDaoEpochInfoV0.fetch(
        subDaoEpochInfo
      );
      expect(epochInfo.dcBurned.toNumber()).eq(toBN(10, 8).toNumber());
    });

    it("calculates subdao rewards", async () => {
      await createHospot()
      const { subDaoEpochInfo } = await burnDc(400000);
      const epoch = (
        await program.account.subDaoEpochInfoV0.fetch(subDaoEpochInfo)
      ).epoch;

      const { pubkeys, instruction: instruction2 } = await program.methods
        .calculateUtilityScoreV0({
          epoch,
        })
        .accounts({
          subDao,
          dao,
        })
        .prepare();
      await sendInstructions(provider, [instruction2], []);

      const subDaoInfo = await program.account.subDaoEpochInfoV0.fetch(
        subDaoEpochInfo
      );
      const daoInfo = await program.account.daoEpochInfoV0.fetch(
        pubkeys.daoEpochInfo!
      );

      expect(daoInfo.numUtilityScoresCalculated).to.eq(1);
      // 4 dc burned, activation fee of 50
      // sqrt(4) * sqrt(1 * 50) = 14.14213562373095 = 14_142_135_623_730
      const totalUtility = "14142135623730";
      expect(daoInfo.totalUtilityScore.toString()).to.eq(totalUtility);
      expect(subDaoInfo.utilityScore!.toString()).to.eq(totalUtility);
    });

    describe("with calculated rewards", () => {
      let epoch: anchor.BN;

      beforeEach(async () => {
        epoch = (await program.account.subDaoEpochInfoV0.fetch(subDaoEpochInfo))
          .epoch;
        await program.methods
          .calculateUtilityScoreV0({
            epoch,
          })
          .accounts({
            subDao,
            dao,
          })
          .rpc();
      });

      it("issues rewards to subdaos", async () => {
        await mintTo(provider, mint, EPOCH_REWARDS, daoTreasury);
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

        const accountInfo = AccountLayout.decode(
          (await provider.connection.getAccountInfo(treasury))?.data!
        );
        expect(accountInfo.amount.toString()).to.eq(EPOCH_REWARDS.toString());
      });
    });
  });
});
