import { sendInstructions } from "@helium-foundation/spl-utils";
import { AccountLayout } from "@solana/spl-token";
import * as anchor from "@project-serum/anchor";
import { BN, Program } from "@project-serum/anchor";
import { SystemProgram, PublicKey, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import { expect } from "chai";
import { heliumSubDaosResolvers } from "../packages/helium-sub-daos-sdk/src";
import { HeliumSubDaos } from "../target/types/helium_sub_daos";
import { TestTracker } from "../target/types/test_tracker";
import { createAtaAndMint, createMint, mintTo } from "./utils/token";

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
  const testTracker = new Program<TestTracker>(
    anchor.workspace.TestTracker.idl,
    anchor.workspace.TestTracker.programId,
    anchor.workspace.TestTracker.provider,
    anchor.workspace.TestTracker.coder,
    () => {
      return heliumSubDaosResolvers;
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
        rewardPerEpoch: new BN(EPOCH_REWARDS)
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
    const daoAcc = await program.account.daoV0.fetch(dao);
    const subDaoMint = await createMint(provider, 6, me, me);
    const treasury = await createAtaAndMint(provider, daoAcc.mint, 0);
    const collection = await createMint(provider, 6, me, me);
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

    return { mint: subDaoMint, subDao: subDao!, collection, treasury };
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
    let treasury: PublicKey;
    let daoTreasury: PublicKey;
    let mint: PublicKey;

    beforeEach(async () => {
      ({ dao, treasury: daoTreasury, mint } = await initTestDao());
      ({ subDao, collection, treasury } = await initTestSubdao(dao));
    });

    it("allows tracking hotspots", async () => {
      const method = await testTracker.methods
        .testAddDevice(collection)
        .accounts({
          // @ts-ignore
          trackerAccounts: {
            subDao,
          },
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
        .preInstructions([
          SystemProgram.transfer({
            fromPubkey: me,
            toPubkey: PublicKey.findProgramAddressSync(
              [Buffer.from("dc_token_auth", "utf8")],
              testTracker.programId
            )[0],
            lamports: 100000000,
          }),
        ])
        .accounts({
          // @ts-ignore
          trackerAccounts: {
            subDao,
          },
        });
      const {
        // @ts-ignore
        trackerAccounts: { subDaoEpochInfo },
      } = await method.pubkeys();
      await method.rpc();

      const epochInfo = await program.account.subDaoEpochInfoV0.fetch(
        subDaoEpochInfo
      );
      expect(epochInfo.dcBurned.toNumber()).eq(2);
    });

    describe("with tracked state", () => {
      let subDaoEpochInfo: PublicKey;
      beforeEach(async () => {
        const {
          instruction,
          signers,
          pubkeys: {
            // @ts-ignore
            trackerAccounts: { subDaoEpochInfo: resultSubDaoEpochInfo },
          },
        } = await testTracker.methods
          // $4 worth
          .testDcBurn(new anchor.BN("40000000000000"))
          .accounts({
            // @ts-ignore
            trackerAccounts: {
              subDao,
            },
          })
          .prepare();
        subDaoEpochInfo = resultSubDaoEpochInfo;
        const { instruction: instruction1, signers: signers1 } =
          await testTracker.methods
            .testAddDevice(collection)
            .accounts({
              // @ts-ignore
              trackerAccounts: {
                subDao,
              },
            })
            .prepare();

        await sendInstructions(
          provider,
          [
            SystemProgram.transfer({
              fromPubkey: me,
              toPubkey: PublicKey.findProgramAddressSync(
                [Buffer.from("dc_token_auth", "utf8")],
                testTracker.programId
              )[0],
              lamports: 100000000,
            }),
            instruction,
            instruction1,
          ],
          [...signers, ...signers1]
        );
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
        // sqrt(4) * sqrt(1 * 50) = 14.14213562373095 = 14_142_135_623_730
        const totalUtility = "14142135623730";
        expect(daoInfo.totalUtilityScore.toString()).to.eq(totalUtility);
        expect(subDaoInfo.utilityScore!.toString()).to.eq(totalUtility);
      });

      describe('with calculated rewards', () => {
        let epoch: anchor.BN;

        beforeEach(async () => {
          epoch = (
            await program.account.subDaoEpochInfoV0.fetch(subDaoEpochInfo)
          ).epoch;
          await program.methods
            .calculateUtilityScoreV0({
              epoch,
            })
            .accounts({
              subDao,
            })
            .rpc();
        })

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

          const accountInfo = AccountLayout.decode((await provider.connection.getAccountInfo(treasury))?.data!);
          expect(accountInfo.amount.toString()).to.eq(EPOCH_REWARDS.toString());
        })
      })
    });
  });
});