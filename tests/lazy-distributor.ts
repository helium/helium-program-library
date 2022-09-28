import { sendInstructions } from "@helium-foundation/spl-utils";
import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import {
  Keypair, PublicKey
} from "@solana/web3.js";
import { expect } from "chai";
import { LazyDistributorSdk } from "../packages/lazy-distributor-sdk/src";
import { LazyDistributor } from "../target/types/lazy_distributor";
import { createMint, createTestNft, mintTo } from "./utils/token";

describe("lazy-distributor", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  const program = anchor.workspace.LazyDistributor as Program<LazyDistributor>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;
  const lazyDistributorSdk = new LazyDistributorSdk(
    provider as anchor.AnchorProvider,
    program
  );
  let collectionMint: PublicKey;
  let rewardsMint: PublicKey;

  beforeEach(async () => {
    const { mintKey: collectionKey } = await createTestNft(provider, me);

    collectionMint = collectionKey;
    rewardsMint = await createMint(provider, 6, me, me);
  });

  it("initializes a lazy distributor", async () => {
    const { lazyDistributor } =
      await lazyDistributorSdk.initializeLazyDistributor({
        rewardsMint,
        collection: collectionMint,
        oracles: [
          {
            oracle: me,
            url: "https://some-url/",
          },
        ],
      });
    const lazyDistributorAcc = await lazyDistributorSdk.getLazyDistributor(
      lazyDistributor
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

      ({ lazyDistributor } = await lazyDistributorSdk.initializeLazyDistributor(
        {
          rewardsMint,
          collection: collectionMint,
          oracles: [
            {
              oracle: me,
              url: "https://some-url/",
            },
          ],
        }
      ));
    });

    it("initializes a recipient", async () => {
      const { recipient } = await lazyDistributorSdk.initializeRecipient({
        lazyDistributor,
        mint,
      });
      const recipientAcc = await lazyDistributorSdk.getRecipient(recipient);

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
        ({ recipient } = await lazyDistributorSdk.initializeRecipient({
          lazyDistributor,
          mint,
        }));
      });

      it("allows the oracle to set current rewards", async () => {
        await lazyDistributorSdk.setCurrentRewards({
          recipient,
          amount: 5,
        });
        const recipientAcc = await lazyDistributorSdk.getRecipient(recipient);
        // @ts-ignore
        expect(recipientAcc?.currentRewards.length).to.eq(1);

        // @ts-ignore
        expect(recipientAcc?.currentRewards[0].toNumber()).to.eq(5000000);
      });

      it("allows distributing current rewards", async () => {
        const lazyDistributorAcc = await lazyDistributorSdk.getLazyDistributor(
          lazyDistributor
        );
        await mintTo(
          provider,
          rewardsMint,
          5000000,
          lazyDistributorAcc!.rewardsAccount
        );
        await lazyDistributorSdk.setCurrentRewards({
          recipient,
          amount: 5,
        });
        const { destination, owner } =
          await lazyDistributorSdk.distributeRewards({ recipient });
        const balance = await provider.connection.getTokenAccountBalance(
          destination
        );
        expect(balance.value.uiAmount).to.eq(5);
        expect(owner.toBase58()).to.eq(me.toBase58());

        // ensure dist same amount does nothing
        await lazyDistributorSdk.setCurrentRewards({
          recipient,
          amount: 5,
        });
        await lazyDistributorSdk.distributeRewards({ recipient });
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

      ({ lazyDistributor } = await lazyDistributorSdk.initializeLazyDistributor(
        {
          rewardsMint,
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
        }
      ));
      ({ recipient } = await lazyDistributorSdk.initializeRecipient({
        lazyDistributor,
        mint,
      }));
    });

    it("distributes the median amount", async () => {
      // Set rewards to the index. oracle1 says 0, 2 says 1, etc
      const setRewardsInstructions = (
        await Promise.all(
          [oracle1, oracle2, oracle3].map(async (oracle, index) => {
            return (
              await lazyDistributorSdk.setCurrentRewardsInstructions({
                amount: index,
                recipient,
                oracle: oracle.publicKey,
              })
            ).instructions;
          })
        )
      ).flat();

      // Make sure our rewards pool has tokens
      const lazyDistributorAcc = await lazyDistributorSdk.getLazyDistributor(
        lazyDistributor
      );
      await mintTo(
        provider,
        rewardsMint,
        1000000,
        lazyDistributorAcc!.rewardsAccount
      );

      // Distribute rewards
      const {
        instructions: distributeInstructions,
        output: { destination },
      } = await lazyDistributorSdk.distributeRewardsInstructions({
        recipient,
      });

      // Run the full set oracle pricing, distribute rewards, all at once
      await sendInstructions(
        provider,
        [...setRewardsInstructions, ...distributeInstructions],
        [oracle1, oracle2, oracle3]
      );

      // Median of 0, 1, 2 should be 1
      const balance = await provider.connection.getTokenAccountBalance(
        destination
      );
      expect(balance.value.uiAmount).to.eq(1);
    });
  });
});
