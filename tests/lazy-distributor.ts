import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ThresholdType } from "@helium/circuit-breaker-sdk";
import {
  Asset,
  createAtaAndMint,
  createMint,
  createNft,
  sendInstructions,
} from "@helium/spl-utils";
import { Tuktuk } from "@helium/tuktuk-idls/lib/types/tuktuk";
import {
  compileTransaction,
  customSignerKey,
  init as initTuktuk,
  RemoteTaskTransactionV0,
  runTask,
  taskKey,
  taskQueueKey,
  taskQueueNameMappingKey,
  tuktukConfigKey,
} from "@helium/tuktuk-sdk";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  Ed25519Program,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { assert, expect } from "chai";
import { sign } from "tweetnacl";
import {
  distributeCompressionRewards,
  init,
  initializeCompressionRecipient,
  updateCompressionDestination,
} from "../packages/lazy-distributor-sdk/src";
import { PROGRAM_ID } from "../packages/lazy-distributor-sdk/src/constants";
import { LazyDistributor } from "../target/types/lazy_distributor";
import { createCompressionNft } from "./utils/compression";
import { ensureLDIdl } from "./utils/fixtures";
import { MerkleTree, MerkleTreeProof } from "@solana/spl-account-compression";
import { loadKeypair } from "./utils/solana";

describe("lazy-distributor", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;
  let program: Program<LazyDistributor>;
  let wallet: Keypair;
  let rewardsMint: PublicKey;

  before(async () => {
    await ensureLDIdl();
  });

  beforeEach(async () => {
    program = await init(
      provider,
      PROGRAM_ID,
      anchor.workspace.LazyDistributor.idl
    );

    wallet = await loadKeypair(process.env.ANCHOR_WALLET!);

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
        approver: null,
      })
      .accountsPartial({
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
    let merkle: Keypair;
    let merkleTree: MerkleTree;
    let creatorHash: Buffer;
    let dataHash: Buffer;

    beforeEach(async () => {
      merkle = Keypair.generate();
      const { mintKey } = await createNft(provider, me);

      mint = mintKey;

      ({ asset, merkleTree, creatorHash, dataHash } =
        await createCompressionNft({
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
          approver: null,
        })
        .accountsPartial({
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
      const method = await program.methods
        .initializeRecipientV0()
        .accountsPartial({
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
          .accountsPartial({
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

      it("allows the oracle to set current rewards with a SetCurrentRewardsTransactionV0", async () => {
        const coder = program.coder.accounts;
        const setCurrentRewardsTransaction = {
          lazyDistributor,
          asset,
          currentRewards: new anchor.BN("5000000"),
          oracleIndex: 0,
        };
        const setCurrentRewardsTransactionBytes = await coder.encode(
          "setCurrentRewardsTransactionV0",
          setCurrentRewardsTransaction
        );
        const signature = Buffer.from(
          sign.detached(
            Uint8Array.from(setCurrentRewardsTransactionBytes),
            wallet.secretKey
          )
        );
        const method = program.methods
          .setCurrentRewardsV1({
            currentRewards: new anchor.BN("5000000"),
            oracleIndex: 0,
          })
          .preInstructions([
            Ed25519Program.createInstructionWithPublicKey({
              publicKey: me.toBytes(),
              message: setCurrentRewardsTransactionBytes,
              signature,
            }),
          ])
          .accountsPartial({
            lazyDistributor,
            recipient,
          });
        await method.rpc({ skipPreflight: true });
      });

      it("allows distributing current rewards", async () => {
        await program.methods
          .setCurrentRewardsV0({
            currentRewards: new anchor.BN("5000000"),
            oracleIndex: 0,
          })
          .accountsPartial({
            lazyDistributor,
            recipient,
          })
          .rpc({ skipPreflight: true });

        const proof = merkleTree.getProof(0);
        const getAssetFn = async () =>
          ({
            ownership: { owner: me },
            compression: { leafId: 0, creatorHash, dataHash },
          } as Asset);
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
          .accountsPartial({
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

      describe("with custom destination", () => {
        const destinationWallet = Keypair.generate();
        let proof: MerkleTreeProof;
        let getAssetFn: any;
        let getAssetProofFn: any;
        beforeEach(async () => {
          proof = merkleTree.getProof(0);
          getAssetFn = async () =>
            ({
              ownership: { owner: me },
              compression: { leafId: 0, creatorHash, dataHash },
            } as Asset);
          getAssetProofFn = async () => {
            return {
              root: new PublicKey(proof.root),
              proof: proof.proof.map((p) => new PublicKey(p)),
              nodeIndex: 0,
              leaf: new PublicKey(proof.leaf),
              treeId: merkle.publicKey,
            };
          };
          (
            await updateCompressionDestination({
              program,
              assetId: asset,
              lazyDistributor,
              destination: destinationWallet.publicKey,
              getAssetFn,
              getAssetProofFn,
            })
          ).rpc({ skipPreflight: true });
        });

        it("allows distributing current rewards", async () => {
          await program.methods
            .setCurrentRewardsV0({
              currentRewards: new anchor.BN("5000000"),
              oracleIndex: 0,
            })
            .accountsPartial({
              lazyDistributor,
              recipient,
            })
            .rpc({ skipPreflight: true });

          const method = await program.methods
            .distributeCustomDestinationV0()
            .accountsPartial({
              common: {
                recipient,
                lazyDistributor,
                rewardsMint,
                owner: destinationWallet.publicKey,
              },
            });

          await method.rpc({ skipPreflight: true });
          const destination = getAssociatedTokenAddressSync(
            rewardsMint,
            destinationWallet.publicKey
          );

          const balance = await provider.connection.getTokenAccountBalance(
            destination
          );
          expect(balance.value.uiAmount).to.eq(5);

          // Make sure dist again doesn't increase balance
          await program.methods
            .setCurrentRewardsV0({
              currentRewards: new anchor.BN("5000000"),
              oracleIndex: 0,
            })
            .accountsPartial({
              lazyDistributor,
              recipient,
            })
            .rpc({ skipPreflight: true });
          await program.methods
            .distributeCustomDestinationV0()
            .accountsPartial({
              common: {
                recipient,
                lazyDistributor,
                rewardsMint,
                owner: destinationWallet.publicKey,
              },
            })
            .rpc({ skipPreflight: true });
          const balance2 = await provider.connection.getTokenAccountBalance(
            destination
          );
          expect(balance2.value.uiAmount).to.eq(5);
        });
      });
    });

    describe("with recipient", () => {
      let recipient: PublicKey;
      beforeEach(async () => {
        const method = await program.methods
          .initializeRecipientV0()
          .accountsPartial({
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
          .accountsPartial({
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
          .accountsPartial({
            lazyDistributor,
            recipient,
          })
          .rpc({ skipPreflight: true });
        const method = await program.methods
          .distributeRewardsV0()
          .accountsPartial({
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
          .accountsPartial({
            lazyDistributor,
            recipient,
          })
          .rpc({ skipPreflight: true });
        await program.methods
          .distributeRewardsV0()
          .accountsPartial({
            common: { recipient, lazyDistributor, rewardsMint },
          })
          .rpc({ skipPreflight: true });
        const balance2 = await provider.connection.getTokenAccountBalance(
          destination
        );
        expect(balance2.value.uiAmount).to.eq(5);
      });

      describe("with custom destination", () => {
        const destinationWallet = Keypair.generate();
        beforeEach(async () => {
          await program.methods
            .updateDestinationV0()
            .accountsPartial({
              recipient,
              destination: destinationWallet.publicKey,
            })
            .rpc({ skipPreflight: true });
        });

        it("allows distributing current rewards", async () => {
          await program.methods
            .setCurrentRewardsV0({
              currentRewards: new anchor.BN("5000000"),
              oracleIndex: 0,
            })
            .accountsPartial({
              lazyDistributor,
              recipient,
            })
            .rpc({ skipPreflight: true });
          const method = await program.methods
            .distributeCustomDestinationV0()
            .accountsPartial({
              common: {
                recipient,
                lazyDistributor,
                rewardsMint,
                owner: destinationWallet.publicKey,
              },
            });
          await method.rpc({ skipPreflight: true });
          // @ts-ignore
          const destination = getAssociatedTokenAddressSync(
            rewardsMint,
            destinationWallet.publicKey
          );

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
            .accountsPartial({
              lazyDistributor,
              recipient,
            })
            .rpc({ skipPreflight: true });
          await program.methods
            .distributeCustomDestinationV0()
            .accountsPartial({
              common: {
                recipient,
                lazyDistributor,
                rewardsMint,
                owner: destinationWallet.publicKey,
              },
            })
            .rpc({ skipPreflight: true });
          const balance2 = await provider.connection.getTokenAccountBalance(
            destination
          );
          expect(balance2.value.uiAmount).to.eq(5);
        });
      });
    });

    // tuktuk verifies the oracle-signed payload against the task it is running only for RemoteV0
    // tasks. set_current_rewards_v1 requires that running task, passed as a remaining account, to
    // be a RemoteV0 task signed by the oracle, so a payload cannot be reused under any other task.
    describe("with a tuktuk remote task", () => {
      const taskQueueName = `ld-${Math.random().toString(36).substring(2, 15)}`;
      const payerSeed = Buffer.from("ld_test", "utf-8");

      let tuktukProgram: Program<Tuktuk>;
      let taskQueue: PublicKey;
      let taskPayer: PublicKey;
      let taskPayerSeeds: Buffer[];
      let recipientA: PublicKey;
      let recipientB: PublicKey;
      let nextTaskId = 0;

      const taskMeta = (task: PublicKey) => ({
        pubkey: task,
        isSigner: false,
        isWritable: false,
      });

      const initRecipient = async (nftMint: PublicKey) => {
        const method = program.methods.initializeRecipientV0().accountsPartial({
          lazyDistributor,
          mint: nftMint,
        });
        await method.rpc({ skipPreflight: true });
        return (await method.pubkeys()).recipient!;
      };

      const queueRemoteTask = async () => {
        const id = nextTaskId++;
        const task = taskKey(taskQueue, id)[0];
        await tuktukProgram.methods
          .queueTaskV0({
            id,
            trigger: { now: {} },
            crankReward: null,
            freeTasks: 0,
            transaction: {
              remoteV0: { url: "https://example.com/rewards", signer: me },
            },
            description: "set current rewards",
          })
          .accountsPartial({ task, taskQueue })
          .rpc({ skipPreflight: true });
        const { queuedAt } = await tuktukProgram.account.taskV0.fetch(task);
        return { task, queuedAt };
      };

      // What the oracle server does: compile the reward instruction into a transaction, then sign
      // the hash tuktuk recomputes from the task it is running.
      const signRewardTask = async (
        task: PublicKey,
        taskQueuedAt: anchor.BN,
        recipient: PublicKey,
        currentRewards: anchor.BN
      ) => {
        const ix = await program.methods
          .setCurrentRewardsV1({ currentRewards, oracleIndex: 0 })
          .accountsPartial({
            lazyDistributor,
            recipient,
            payer: taskPayer,
          })
          .remainingAccounts([taskMeta(task)])
          .instruction();
        const { transaction, remainingAccounts } = compileTransaction(
          [ix],
          [taskPayerSeeds]
        );
        const remoteTaskTransaction = await RemoteTaskTransactionV0.serialize(
          tuktukProgram.coder.accounts,
          new RemoteTaskTransactionV0({
            task,
            taskQueuedAt,
            transaction: {
              ...transaction,
              accounts: remainingAccounts.map((acc) => acc.pubkey),
            },
          })
        );
        return {
          remoteTaskTransaction,
          remainingAccounts,
          signature: Buffer.from(
            sign.detached(
              Uint8Array.from(remoteTaskTransaction),
              wallet.secretKey
            )
          ),
        };
      };

      // A compiled task queued by someone else. tuktuk runs whatever instruction it was queued
      // with, here a much larger reward for a recipient the oracle never signed for, preceded by
      // an oracle signature that was issued for a different task.
      const replayUnderOwnTask = async (
        signed: Awaited<ReturnType<typeof signRewardTask>>,
        task: PublicKey | null
      ) => {
        const id = nextTaskId++;
        const ownTask = taskKey(taskQueue, id)[0];
        const ix = await program.methods
          .setCurrentRewardsV1({
            currentRewards: new anchor.BN("100000000000"),
            oracleIndex: 0,
          })
          .accountsPartial({
            lazyDistributor,
            recipient: recipientB,
            payer: taskPayer,
          })
          .remainingAccounts(task ? [taskMeta(task)] : [])
          .instruction();
        const { transaction, remainingAccounts } = compileTransaction(
          [ix],
          [taskPayerSeeds]
        );
        await tuktukProgram.methods
          .queueTaskV0({
            id,
            trigger: { now: {} },
            crankReward: null,
            freeTasks: 0,
            transaction: { compiledV0: [transaction] },
            description: "replayed rewards",
          })
          .accountsPartial({ task: ownTask, taskQueue })
          .remainingAccounts(remainingAccounts)
          .rpc({ skipPreflight: true });

        const tx = new Transaction();
        tx.add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
          Ed25519Program.createInstructionWithPublicKey({
            publicKey: me.toBytes(),
            message: signed.remoteTaskTransaction,
            signature: signed.signature,
          }),
          ...(await runTask({
            program: tuktukProgram,
            task: ownTask,
            crankTurner: me,
          }))
        );
        try {
          await provider.sendAndConfirm(tx);
        } catch (e: any) {
          return [e.message, ...(e.logs || [])].join("\n");
        }
        return null;
      };

      const expectRejectedWith = (logs: string | null, errorName: string) => {
        expect(logs, "expected the replay to be rejected on chain").to.be.a(
          "string"
        );
        expect(logs).to.include(errorName);
      };

      before(async () => {
        tuktukProgram = await initTuktuk(provider);
        const tuktukConfig = tuktukConfigKey()[0];
        const config =
          await tuktukProgram.account.tuktukConfigV0.fetch(tuktukConfig);
        taskQueue = taskQueueKey(tuktukConfig, config.nextTaskQueueId)[0];
        await tuktukProgram.methods
          .initializeTaskQueueV0({
            name: taskQueueName,
            minCrankReward: new anchor.BN(1),
            capacity: 100,
            lookupTables: [],
            staleTaskAge: 10000,
          })
          .accounts({
            tuktukConfig,
            payer: me,
            updateAuthority: me,
            taskQueue,
            taskQueueNameMapping: taskQueueNameMappingKey(
              tuktukConfig,
              taskQueueName
            )[0],
          })
          .rpc();
        await tuktukProgram.methods
          .addQueueAuthorityV0()
          .accounts({ payer: me, queueAuthority: me, taskQueue })
          .rpc();

        const [payer, bump] = customSignerKey(taskQueue, [payerSeed]);
        const bumpBuffer = Buffer.alloc(1);
        bumpBuffer.writeUint8(bump);
        taskPayer = payer;
        taskPayerSeeds = [payerSeed, bumpBuffer];
        // The task's transaction is signed for by a tuktuk custom signer, which pays the
        // recipient's rent the way the distributor oracle's claim payer does.
        await sendInstructions(provider, [
          SystemProgram.transfer({
            fromPubkey: me,
            toPubkey: taskPayer,
            lamports: 1000000000,
          }),
        ]);
      });

      beforeEach(async () => {
        recipientA = await initRecipient(mint);
        const { mintKey } = await createNft(provider, me);
        recipientB = await initRecipient(mintKey);
      });

      it("allows the oracle to set the rewards it signed for", async () => {
        const { task, queuedAt } = await queueRemoteTask();
        const signed = await signRewardTask(
          task,
          queuedAt,
          recipientA,
          new anchor.BN("5000000")
        );

        await sendInstructions(provider, [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
          ...(await runTask({
            program: tuktukProgram,
            task,
            crankTurner: me,
            fetcher: async () => signed,
          })),
        ]);

        const recipientAcc =
          await program.account.recipientV0.fetch(recipientA);
        expect(recipientAcc.currentRewards[0]!.toNumber()).to.eq(5000000);
      });

      it("rejects a signed payload replayed with no task", async () => {
        const { task, queuedAt } = await queueRemoteTask();
        const signed = await signRewardTask(
          task,
          queuedAt,
          recipientA,
          new anchor.BN("5000000")
        );

        expectRejectedWith(
          await replayUnderOwnTask(signed, null),
          "InvalidRemoteTask"
        );
        const recipientAcc =
          await program.account.recipientV0.fetch(recipientB);
        expect(recipientAcc.currentRewards[0]).to.be.null;
      });

      it("rejects a signed payload replayed under a compiled task", async () => {
        const { task, queuedAt } = await queueRemoteTask();
        const signed = await signRewardTask(
          task,
          queuedAt,
          recipientA,
          new anchor.BN("5000000")
        );
        const ownTask = taskKey(taskQueue, nextTaskId)[0];

        expectRejectedWith(
          await replayUnderOwnTask(signed, ownTask),
          "InvalidRemoteTask"
        );
        const recipientAcc =
          await program.account.recipientV0.fetch(recipientB);
        expect(recipientAcc.currentRewards[0]).to.be.null;
      });

      it("rejects a signed payload replayed against the task it was signed for", async () => {
        const { task, queuedAt } = await queueRemoteTask();
        const signed = await signRewardTask(
          task,
          queuedAt,
          recipientA,
          new anchor.BN("5000000")
        );

        expectRejectedWith(
          await replayUnderOwnTask(signed, task),
          "InvalidRemoteTask"
        );
        const recipientAcc =
          await program.account.recipientV0.fetch(recipientB);
        expect(recipientAcc.currentRewards[0]).to.be.null;
      });
    });

    it("updates lazy distributor", async () => {
      await program.methods
        .updateLazyDistributorV0({
          authority: PublicKey.default,
          oracles: [
            {
              oracle: PublicKey.default,
              url: "https://some-other-url",
            },
          ],
          approver: null,
        })
        .accountsPartial({
          rewardsMint,
        })
        .rpc();

      const ld = await program.account.lazyDistributorV0.fetch(lazyDistributor);
      assert.isTrue(PublicKey.default.equals(ld.authority));
      assert.isTrue(ld.oracles.length == 1);
      assert.equal(ld.oracles[0].url, "https://some-other-url");
      assert.isTrue(PublicKey.default.equals(ld.oracles[0].oracle));
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
          approver: null,
        })
        .accountsPartial({
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

      const method2 = await program.methods
        .initializeRecipientV0()
        .accountsPartial({
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
              .accountsPartial({
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
        .accountsPartial({
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
