import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ThresholdType } from "@helium/circuit-breaker-sdk";
import {
  Asset, createAtaAndMint, createMint, createNft, sendInstructions
} from "@helium/spl-utils";
import { Keypair, PublicKey } from "@solana/web3.js";
import { assert, expect } from "chai";
import { MerkleTree } from "../deps/solana-program-library/account-compression/sdk/src/merkle-tree";
import {
  distributeCompressionRewards,
  init,
  initializeCompressionRecipient
} from "../packages/lazy-distributor-sdk/src";
import { PROGRAM_ID } from "../packages/lazy-distributor-sdk/src/constants";
import { LazyDistributor } from "../target/types/lazy_distributor";
import { createCompressionNft } from "./utils/compression";

describe("lazy-distributor", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;
  let program: Program<LazyDistributor>;
  let rewardsMint: PublicKey;

  beforeEach(async () => {
    program = await init(
      provider,
      PROGRAM_ID,
      anchor.workspace.LazyDistributor.idl
    );

    rewardsMint = await createMint(provider, 6, me, me);
  });

  it("initializes a lazy distributor", async () => {
    const method = await program.methods
      .initializeLazyDistributorV0({
        authority: me,
        oracles: [
          {
            oracle: me,
            url: "https://some-url/",
          },
        ],
        windowConfig: {
          windowSizeSeconds: new anchor.BN(10),
          thresholdType: ThresholdType.Absolute as never,
          threshold: new anchor.BN(1000000000),
        },
      })
      .accounts({
        rewardsMint,
      });

    const { lazyDistributor } = await method.pubkeys();
    await method.rpc({ skipPreflight: true });
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
    let asset: PublicKey;
    let merkle = Keypair.generate();
    let merkleTree: MerkleTree;
    let creatorHash: Buffer;
    let dataHash: Buffer;

    beforeEach(async () => {
      const { mintKey } = await createNft(provider, me);
      mint = mintKey;

      ({ asset, merkleTree, creatorHash, dataHash } = await createCompressionNft({
        provider,
        recipient: me,
        merkle,
      }));

      const method = await program.methods
        .initializeLazyDistributorV0({
          authority: me,
          oracles: [
            {
              oracle: me,
              url: "https://some-url/",
            },
          ],
          windowConfig: {
            windowSizeSeconds: new anchor.BN(10),
            thresholdType: ThresholdType.Absolute as never,
            threshold: new anchor.BN(1000000000),
          },
        })
        .accounts({
          rewardsMint,
        });
      await method.rpc({ skipPreflight: true });
      const pubkeys = await method.pubkeys();
      lazyDistributor = pubkeys.lazyDistributor!;
      await createAtaAndMint(
        provider,
        pubkeys.rewardsMint!,
        1000000000000,
        pubkeys.lazyDistributor
      );
    });

    it("initializes a recipient", async () => {
      const method = await program.methods.initializeRecipientV0().accounts({
        lazyDistributor,
        mint,
      });
      await method.rpc({ skipPreflight: true });
      const recipient = (await method.pubkeys()).recipient!;
      const recipientAcc = await program.account.recipientV0.fetch(recipient);

      expect(recipientAcc?.asset.toBase58()).to.eq(mint.toBase58());
      expect(recipientAcc?.lazyDistributor.toBase58()).to.eq(
        lazyDistributor.toBase58()
      );
      // @ts-ignore
      expect(recipientAcc?.currentRewards[0]).to.be.null;
      // @ts-ignore
      expect(recipientAcc?.currentRewards.length).to.eq(1);
      expect(recipientAcc?.totalRewards.toNumber()).to.eq(0);
    });

    it("initializes a recipient from compression", async () => {
      const proof = merkleTree.getProof(0);
      const method = await initializeCompressionRecipient({
        program,
        assetId: asset,
        lazyDistributor,
        getAssetFn: async () => {
          return {
            ownership: { owner: me },
            compression: {
              leafId: 0,
              dataHash,
              creatorHash
            },
          } as Asset;
        },
        getAssetProofFn: async () => {
          return {
            root: new PublicKey(proof.root),
            proof: proof.proof.map((p) => new PublicKey(p)),
            nodeIndex: 0,
            leaf: new PublicKey(proof.leaf),
            treeId: merkle.publicKey,
          };
        },
      });
      await method.rpc({ skipPreflight: true });
      const recipient = (await method.pubkeys()).recipient!;
      const recipientAcc = await program.account.recipientV0.fetch(recipient);

      expect(recipientAcc?.asset.toBase58()).to.eq(asset.toBase58());
      expect(recipientAcc?.lazyDistributor.toBase58()).to.eq(
        lazyDistributor.toBase58()
      );
      // @ts-ignore
      expect(recipientAcc?.currentRewards[0]).to.be.null;
      // @ts-ignore
      expect(recipientAcc?.currentRewards.length).to.eq(1);
      expect(recipientAcc?.totalRewards.toNumber()).to.eq(0);
    });

    describe("with compression recipient", () => {
      let recipient: PublicKey;
      beforeEach(async () => {
        const proof = merkleTree.getProof(0);
        const method = await initializeCompressionRecipient({
          program,
          assetId: asset,
          lazyDistributor,
          getAssetFn: async () => {
            return {
              ownership: { owner: me },
              compression: {
                leafId: 0,
                dataHash,
                creatorHash,
              },
            } as Asset;
          },
          getAssetProofFn: async () => {
            return {
              root: new PublicKey(proof.root),
              proof: proof.proof.map((p) => new PublicKey(p)),
              nodeIndex: 0,
              leaf: new PublicKey(proof.leaf),
              treeId: merkle.publicKey,
            };
          },
        });
        await method.rpc({ skipPreflight: true });

        recipient = (await method.pubkeys()).recipient!;
      });

      it("allows the oracle to set current rewards", async () => {
        await program.methods
          .setCurrentRewardsV0({
            currentRewards: new anchor.BN("5000000"),
            oracleIndex: 0,
          })
          .accounts({
            lazyDistributor,
            recipient,
          })
          .rpc({ skipPreflight: true });
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
            lazyDistributor,
            recipient,
          })
          .rpc({ skipPreflight: true });

        const proof = merkleTree.getProof(0);
        const getAssetFn = async () => ({ ownership: { owner: me }, compression: { leafId: 0, creatorHash, dataHash } } as Asset);
        const getAssetProofFn = async () => {
          return {
            root: new PublicKey(proof.root),
            proof: proof.proof.map((p) => new PublicKey(p)),
            nodeIndex: 0,
            leaf: new PublicKey(proof.leaf),
            treeId: merkle.publicKey,
          };
        };
        const method = await distributeCompressionRewards({
          program,
          assetId: asset,
          lazyDistributor,
          getAssetFn,
          getAssetProofFn,
        });

        await method.rpc({ skipPreflight: true });
        const destination = (await method.pubkeys()).common!
          .destinationAccount!;

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
            lazyDistributor,
            recipient,
          })
          .rpc({ skipPreflight: true });
        await (
          await distributeCompressionRewards({
            program,
            assetId: asset,
            lazyDistributor,
            getAssetFn,
            getAssetProofFn,
          })
        ).rpc({ skipPreflight: true });
        const balance2 = await provider.connection.getTokenAccountBalance(
          destination
        );
        expect(balance2.value.uiAmount).to.eq(5);
      });
    });

    describe("with recipient", () => {
      let recipient: PublicKey;
      beforeEach(async () => {
        const method = await program.methods.initializeRecipientV0().accounts({
          lazyDistributor,
          mint,
        });
        await method.rpc({ skipPreflight: true });

        recipient = (await method.pubkeys()).recipient!;
      });

      it("allows the oracle to set current rewards", async () => {
        await program.methods
          .setCurrentRewardsV0({
            currentRewards: new anchor.BN("5000000"),
            oracleIndex: 0,
          })
          .accounts({
            lazyDistributor,
            recipient,
          })
          .rpc({ skipPreflight: true });
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
            lazyDistributor,
            recipient,
          })
          .rpc({ skipPreflight: true });
        const method = await program.methods.distributeRewardsV0().accounts({
          common: { recipient, lazyDistributor, rewardsMint },
        });
        await method.rpc({ skipPreflight: true });
        // @ts-ignore
        const destination = (await method.pubkeys()).common.destinationAccount!;

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
            lazyDistributor,
            recipient,
          })
          .rpc({ skipPreflight: true });
        await program.methods
          .distributeRewardsV0()
          .accounts({
            common: { recipient, lazyDistributor, rewardsMint },
          })
          .rpc({ skipPreflight: true });
        const balance2 = await provider.connection.getTokenAccountBalance(
          destination
        );
        expect(balance2.value.uiAmount).to.eq(5);
      });
    });

    it("updates lazy distributor", async() => {
      await program.methods.updateLazyDistributorV0({
        authority: PublicKey.default,
        oracles: [
          {
            oracle: PublicKey.default,
            url: "https://some-other-url",
          }
        ]
      }).accounts({
        rewardsMint
      }).rpc()

      const ld = await program.account.lazyDistributorV0.fetch(lazyDistributor);
      assert.isTrue(PublicKey.default.equals(ld.authority));
      assert.isTrue(ld.oracles.length == 1);
      assert.equal(ld.oracles[0].url, "https://some-other-url");
      assert.isTrue(PublicKey.default.equals(ld.oracles[0].oracle));
    })
  });

  describe("multiple oracles", () => {
    const oracle1 = Keypair.generate();
    const oracle2 = Keypair.generate();
    const oracle3 = Keypair.generate();

    let mint: PublicKey;
    let lazyDistributor: PublicKey;
    let recipient: PublicKey;

    beforeEach(async () => {
      const { mintKey } = await createNft(provider, me);
      mint = mintKey;
      const method = await program.methods
        .initializeLazyDistributorV0({
          authority: me,
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
          windowConfig: {
            windowSizeSeconds: new anchor.BN(10),
            thresholdType: ThresholdType.Absolute as never,
            threshold: new anchor.BN(1000000000),
          },
        })
        .accounts({
          rewardsMint,
        });

      lazyDistributor = (await method.pubkeys()).lazyDistributor!;
      const pubkeys = await method.pubkeys();
      await method.rpc({ skipPreflight: true });
      await createAtaAndMint(
        provider,
        pubkeys.rewardsMint!,
        1000000000000,
        pubkeys.lazyDistributor
      );

      const method2 = await program.methods.initializeRecipientV0().accounts({
        lazyDistributor,
        mint,
      });
      await method2.rpc({ skipPreflight: true });
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
                lazyDistributor,
                recipient,
                oracle: oracle.publicKey,
              })
              .instruction();
          })
        )
      ).flat();

      // Distribute rewards
      const {
        instruction: distributeInstruction,
        pubkeys: { common },
      } = await program.methods
        .distributeRewardsV0()
        .accounts({
          common: { recipient, lazyDistributor, rewardsMint },
        })
        .prepare();
      const destination = common?.destinationAccount;

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
