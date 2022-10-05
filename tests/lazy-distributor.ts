import { sendInstructions } from "@helium-foundation/spl-utils";
import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import { init, lazyDistributorKey, recipientKey } from "../packages/lazy-distributor-sdk/src";
import { PROGRAM_ID } from "../packages/lazy-distributor-sdk/src/constants";
import { LazyDistributor } from "../target/types/lazy_distributor";
import { createMint, createTestNft, mintTo } from "./utils/token";
import { AuthorityType, createSetAuthorityInstruction } from "@solana/spl-token";

describe("lazy-distributor", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;
  let program: Program<LazyDistributor>;
  let collectionMint: PublicKey;
  let rewardsMint: PublicKey;
  let lazyDistributor: PublicKey

  beforeEach(async () => {
    const { mintKey: collectionKey } = await createTestNft(provider, me);
    program = await init(
      provider,
      PROGRAM_ID,
      anchor.workspace.LazyDistributor.idl
    );

    collectionMint = collectionKey;
    rewardsMint = await createMint(provider, 6, me, me);
    await sendInstructions(provider, [
      await createSetAuthorityInstruction(
        rewardsMint,
        me,
        AuthorityType.MintTokens,
        (await lazyDistributorKey(collectionMint, rewardsMint))[0]
      ),
    ]);
    
  });

  it("initializes a lazy distributor", async () => {
    const method = await program.methods.initializeLazyDistributorV0({
      authority: me,
      collection: collectionMint,
      oracles: [
        {
          oracle: me,
          url: "https://some-url/",
        },
      ],
    }).accounts({
      rewardsMint
    });

    const { lazyDistributor } = await method.pubkeys();
    await method.rpc();
    const lazyDistributorAcc = await program.account.lazyDistributorV0.fetch(
      lazyDistributor!
    );
    expect(lazyDistributorAcc?.authority.toBase58()).to.eq(me.toBase58());
    // @ts-ignore
    expect(lazyDistributorAcc?.oracles[0].oracle.toBase58()).to.eq(
      me.toBase58()
    );
    // @ts-ignore
    expect(lazyDistributorAcc?.oracles[0].url).to.eq("https://some-url/");
  });

  describe("with lazy distributor", () => {
    let mint: PublicKey;
    let lazyDistributor: PublicKey;

    beforeEach(async () => {
      const { mintKey } = await createTestNft(provider, me, collectionMint);
      mint = mintKey;

      const method = await program.methods
        .initializeLazyDistributorV0({
          authority: me,
          collection: collectionMint,
          oracles: [
            {
              oracle: me,
              url: "https://some-url/",
            },
          ],
        })
        .accounts({
          rewardsMint,
        });
      await method.rpc();
      lazyDistributor = (await method.pubkeys()).lazyDistributor!;
    });

    it("initializes a recipient", async () => {
      const method = await program.methods.initializeRecipientV0().accounts({
        lazyDistributor,
        mint
      });
      await method.rpc();
      const recipient = (await method.pubkeys()).recipient!;
      const recipientAcc = await program.account.recipientV0.fetch(recipient);

      expect(recipientAcc?.mint.toBase58()).to.eq(mint.toBase58());
      expect(recipientAcc?.lazyDistributor.toBase58()).to.eq(
        lazyDistributor.toBase58()
      );
      // @ts-ignore
      expect(recipientAcc?.currentRewards[0]).to.be.null;
      // @ts-ignore
      expect(recipientAcc?.currentRewards.length).to.eq(1);
      expect(recipientAcc?.totalRewards.toNumber()).to.eq(0);
    });

    describe("with recipient", () => {
      let recipient: PublicKey;
      beforeEach(async () => {
         const method = await program.methods.initializeRecipientV0().accounts({
           lazyDistributor,
           mint,
         });
         await method.rpc();
        recipient = (await method.pubkeys()).recipient!;
      });

      it("allows the oracle to set current rewards", async () => {
        await program.methods
          .setCurrentRewardsV0({
            currentRewards: new anchor.BN("5000000"),
            oracleIndex: 0,
          })
          .accounts({
            recipient,
          })
          .rpc();
        const recipientAcc = await program.account.recipientV0.fetch(recipient);
        // @ts-ignore
        expect(recipientAcc?.currentRewards.length).to.eq(1);

        // @ts-ignore
        expect(recipientAcc?.currentRewards[0].toNumber()).to.eq(5000000);
      });

      it("allows distributing current rewards", async () => {
        await program.methods
          .setCurrentRewardsV0({
            currentRewards: new anchor.BN("5000000"),
            oracleIndex: 0,
          })
          .accounts({
            recipient,
          })
          .rpc();
        const method = await program.methods
          .distributeRewardsV0()
          .accounts({ recipient });
        await method.rpc();
        const destination = (await method.pubkeys()).destinationAccount!;

        const balance = await provider.connection.getTokenAccountBalance(
          destination
        );
        expect(balance.value.uiAmount).to.eq(5);

        // ensure dist same amount does nothing
        await program.methods
          .setCurrentRewardsV0({
            currentRewards: new anchor.BN("5000000"),
            oracleIndex: 0,
          })
          .accounts({
            recipient,
          })
          .rpc();
        await program.methods
          .distributeRewardsV0()
          .accounts({ recipient })
          .rpc();
        const balance2 = await provider.connection.getTokenAccountBalance(
          destination
        );
        expect(balance2.value.uiAmount).to.eq(5);
      });
    });
  });

  describe("multiple oracles", () => {
    const oracle1 = Keypair.generate();
    const oracle2 = Keypair.generate();
    const oracle3 = Keypair.generate();

    let mint: PublicKey;
    let lazyDistributor: PublicKey;
    let recipient: PublicKey;

    beforeEach(async () => {
      const { mintKey } = await createTestNft(provider, me, collectionMint);
      mint = mintKey;
      const method = await program.methods
        .initializeLazyDistributorV0({
          authority: me,
          collection: collectionMint,
          oracles: [
            {
              oracle: oracle1.publicKey,
              url: "https://some-url/",
            },
            {
              oracle: oracle2.publicKey,
              url: "https://some-url/",
            },
            {
              oracle: oracle3.publicKey,
              url: "https://some-url/",
            },
          ],
        })
        .accounts({
          rewardsMint,
        });

      lazyDistributor = (await method.pubkeys()).lazyDistributor!;
      await method.rpc();

      const method2 = await program.methods.initializeRecipientV0().accounts({
        lazyDistributor,
        mint,
      });
      await method2.rpc();
      recipient = (await method2.pubkeys()).recipient!;
    });

    it("distributes the median amount", async () => {
      // Set rewards to the index. oracle1 says 0, 2 says 1, etc
      const setRewardsInstructions = (
        await Promise.all(
          [oracle1, oracle2, oracle3].map(async (oracle, index) => {
            return await program.methods
              .setCurrentRewardsV0({
                currentRewards: new anchor.BN(index * 1000000),
                oracleIndex: index,
              })
              .accounts({
                recipient,
                oracle: oracle.publicKey,
              })
              .instruction();
          })
        )
      ).flat();

      // Distribute rewards
      const { instruction: distributeInstruction, pubkeys: { destinationAccount: destination } } = await program.methods
        .distributeRewardsV0()
        .accounts({ recipient })
        .prepare();

      // Run the full set oracle pricing, distribute rewards, all at once
      await sendInstructions(
        provider,
        [...setRewardsInstructions, distributeInstruction],
        [oracle1, oracle2, oracle3]
      );

      // Median of 0, 1, 2 should be 1
      const balance = await provider.connection.getTokenAccountBalance(
        destination!
      );
      expect(balance.value.uiAmount).to.eq(1);
    });
  });
});
