import { HeliumSubDaos } from "@helium-foundation/idls/lib/types/helium_sub_daos";
import { TestTracker } from "@helium-foundation/idls/lib/types/test_tracker";
import { sendInstructions, toBN } from "@helium-foundation/spl-utils";
import { Keypair as HeliumKeypair } from "@helium/crypto";
import * as anchor from "@project-serum/anchor";
import { BN, Program } from "@project-serum/anchor";
import { AccountLayout } from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import { init as dcInit } from "../packages/data-credits-sdk/src";
import { heliumSubDaosResolvers } from "../packages/helium-sub-daos-sdk/src";
import { init as issuerInit } from "../packages/hotspot-issuance-sdk/src";
import { DataCredits } from "../target/types/data_credits";
import { HotspotIssuance } from "../target/types/hotspot_issuance";
import { ensureDCIdl, initWorld } from "./utils/fixtures";
import {
  createAtaAndMint,
  createMint,
  createTestNft,
  mintTo,
} from "./utils/token";

const EPOCH_REWARDS = 100000000;

export const initTestDao = async (
  program: Program<HeliumSubDaos>,
  provider: anchor.AnchorProvider
): Promise<{
  mint: PublicKey;
  dao: PublicKey;
  treasury: PublicKey;
}> => {
  const me = provider.wallet.publicKey;
  const mint = await createMint(provider, 6, me, me);
  const method = await program.methods
    .initializeDaoV0({
      authority: me,
      rewardPerEpoch: new BN(EPOCH_REWARDS),
    })
    .accounts({
      mint,
    });
  const { dao, treasury } = await method.pubkeys();
  await method.rpc();

  return { mint, dao: dao!, treasury: treasury! };
};

export const initTestSubdao = async (
  program: Program<HeliumSubDaos>,
  provider: anchor.AnchorProvider,
  dao: PublicKey,
  collection: PublicKey
): Promise<{
  mint: PublicKey;
  subDao: PublicKey;
  treasury: PublicKey;
}> => {
  const me = provider.wallet.publicKey;
  const daoAcc = await program.account.daoV0.fetch(dao);
  const subDaoMint = await createMint(provider, 6, me, me);
  const treasury = await createAtaAndMint(provider, daoAcc.mint, 0);
  const method = await program.methods
    .initializeSubDaoV0({
      authority: me,
    })
    .accounts({
      dao,
      subDaoMint,
      hotspotCollection: collection,
      treasury,
      mint: daoAcc.mint,
    });
  const { subDao } = await method.pubkeys();
  await method.rpc();

  return { mint: subDaoMint, subDao: subDao!, treasury };
};

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
    const { dao, treasury, mint } = await initTestDao(program, provider);
    const account = await program.account.daoV0.fetch(dao!);
    expect(account.authority.toBase58()).eq(me.toBase58());
    expect(account.mint.toBase58()).eq(mint.toBase58());
    expect(account.treasury.toBase58()).eq(treasury!.toBase58());
  });

  it("initializes a subdao", async () => {
    const { dao } = await initTestDao(program, provider);
    const collection = (await createTestNft(provider, me)).mintKey;
    const { subDao, treasury, mint } = await initTestSubdao(
      program,
      provider,
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
    let mint: PublicKey;
    let onboardingServerKeypair: Keypair;
    let makerKeypair: Keypair;
    let subDaoEpochInfo: PublicKey;

    beforeEach(async () => {
      ({
        hotspotConfig: { onboardingServerKeypair },
        subDao: { subDao, treasury, mint },
        dao: { dao, treasury: daoTreasury },
        issuer: { makerKeypair, hotspotIssuer },
      } = await initWorld(provider, issuerProgram, program, dcProgram));

      const ecc = await (await HeliumKeypair.makeRandom()).address.publicKey;
      const hotspotOwner = Keypair.generate().publicKey;

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
      await method.rpc();
    });

    it("allows tracking hotspots", async () => {
      const epochInfo = await program.account.subDaoEpochInfoV0.fetch(
        subDaoEpochInfo
      );
      expect(epochInfo.totalDevices.toNumber()).eq(1);
    });

    it("allows tracking dc spend", async () => {
      await sendInstructions(provider, [
        SystemProgram.transfer({
          fromPubkey: me,
          toPubkey: PublicKey.findProgramAddressSync(
            [Buffer.from("dc", "utf8")],
            dcProgram.programId
          )[0],
          lamports: 100000000,
        }),
      ]);

      const epochInfo = await program.account.subDaoEpochInfoV0.fetch(
        subDaoEpochInfo
      );
      expect(epochInfo.dcBurned.toNumber()).eq(toBN(1, 8).toNumber());
    });

    it("calculates subdao rewards", async () => {
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
      // sqrt(50) * sqrt(1 * 0.00001 + 50) = ...
      const totalUtility = "20000000000000";
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
