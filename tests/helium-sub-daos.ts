import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { PublicKey, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import { expect } from "chai";
import { heliumSubDaosResolvers } from "../packages/helium-sub-daos-sdk/src";
import { HeliumSubDaos } from "../target/types/helium_sub_daos";
import { TestTracker } from "../target/types/test_tracker";
import { createAtaAndMint, createMint } from "./utils/token";

describe("helium-sub-daos", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  const program = anchor.workspace.HeliumSubDaos as Program<HeliumSubDaos>;
  const testTracker = new Program<TestTracker>(
    anchor.workspace.TestTracker.idl,
    anchor.workspace.TestTracker.programId,
    anchor.workspace.TestTracker.provider,
    anchor.workspace.TestTracker.coder,
    () => {
      return heliumSubDaosResolvers
    }
  );

  anchor.workspace.TestTracker as Program<TestTracker>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;

  async function initTestDao(): Promise<{
    mint: PublicKey;
    dao: PublicKey;
    treasury: PublicKey;
  }> {
    const mint = await createMint(provider, 6, me, me);
    const method = await program.methods
      .initializeDaoV0({
        authority: me,
      })
      .accounts({
        mint,
      });
    const { dao, treasury } = await method.pubkeys();
    await method.rpc();

    return { mint, dao: dao!, treasury: treasury! };
  }

  async function initTestSubdao(dao: PublicKey): Promise<{
    mint: PublicKey;
    subDao: PublicKey;
    collection: PublicKey;
    treasury: PublicKey;
  }> {
    const mint = await createMint(provider, 6, me, me);
    const treasury = await createAtaAndMint(provider, mint, 100);
    const collection = await createMint(provider, 6, me, me);
    const method = await program.methods
      .initializeSubDaoV0({
        authority: me,
      })
      .accounts({
        dao,
        mint,
        hotspotCollection: collection,
        treasury,
      });
    const { subDao } = await method.pubkeys();
    await method.rpc();

    return { mint, subDao: subDao!, collection, treasury };
  }

  it("initializes a dao", async () => {
    const { dao, treasury, mint } = await initTestDao();
    const account = await program.account.daoV0.fetch(dao!);
    expect(account.authority.toBase58()).eq(me.toBase58());
    expect(account.mint.toBase58()).eq(mint.toBase58());
    expect(account.treasury.toBase58()).eq(treasury!.toBase58());
  });

  it("initializes a subdao", async () => {
    const { dao } = await initTestDao();
    const { subDao, collection, treasury, mint } = await initTestSubdao(dao);

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
    let collection: PublicKey;

    before(async () => {
      ({ dao } = await initTestDao());
      ({ subDao, collection } = await initTestSubdao(dao));
    });

    it("allows tracking hotspots", async () => {
      const method = await testTracker.methods
        .testAddDevice(collection)
        .accounts({
          // @ts-ignore
          trackerAccounts: {
            subDao,
          },
          heliumSubDaos: program.programId,
        });
      const {
        // @ts-ignore
        trackerAccounts: { subDaoEpochInfo },
      } = await method.pubkeys();
      await method.rpc({
        skipPreflight: true,
      });

      const epochInfo = await program.account.subDaoEpochInfoV0.fetch(
        subDaoEpochInfo
      );
      expect(epochInfo.totalDevices.toNumber()).eq(1);
    });

    it("allows tracking dc spend", async () => {
      const method = await testTracker.methods
        .testDcBurn(new anchor.BN(2))
        .accounts({
          // @ts-ignore
          trackerAccounts: {
            subDao,
          },
          heliumSubDaos: program.programId,
        });
      const {
        // @ts-ignore
        trackerAccounts: { subDaoEpochInfo },
      } = await method.pubkeys();
      await method.rpc({
        skipPreflight: true,
      });

      const epochInfo = await program.account.subDaoEpochInfoV0.fetch(
        subDaoEpochInfo
      );
      expect(epochInfo.dcBurned.toNumber()).eq(2);
    });
  });
});
