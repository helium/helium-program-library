import { publicProcedure } from "../../../procedures";
import { env } from "@/lib/env";
import { createSolanaConnection, getCluster, loadKeypair } from "@/lib/solana";
import { connectToDb } from "@/lib/utils/db";
import { getAssetIdFromPubkey } from "@/lib/utils/hotspot-helpers";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import { getJitoTipInstruction, shouldUseJitoBundle } from "@/lib/utils/jito";
import { getTotalTransactionFees } from "@/lib/utils/balance-validation";
import { toTokenAmountOutput, solToLamportsBN } from "@/lib/utils/token-math";
import { TOKEN_MINTS } from "@/lib/constants/tokens";
import { HNT_LAZY_DISTRIBUTOR_ADDRESS } from "@/lib/constants/lazy-distributor";
import {
  init as initLd,
  recipientKey,
  updateCompressionDestination,
} from "@helium/lazy-distributor-sdk";
import { init as initMiniFanout } from "@helium/mini-fanout-sdk";
import {
  init as initWelcomePack,
  userWelcomePacksKey,
  welcomePackKey,
  closeWelcomePack,
} from "@helium/welcome-pack-sdk";
import {
  init as initTuktuk,
  nextAvailableTaskIds,
  taskKey,
} from "@helium/tuktuk-sdk";
import {
  batchInstructionsToTxsWithPriorityFee,
  getAsset,
  getAssetProof,
  HELIUM_COMMON_LUT,
  HELIUM_COMMON_LUT_DEVNET,
  HNT_MINT,
  proofArgsAndAccounts,
  toVersionedTx,
  type TransactionDraft,
} from "@helium/spl-utils";
import {
  PROGRAM_ID as BUBBLEGUM_PROGRAM_ID,
  createTransferInstruction,
} from "@metaplex-foundation/mpl-bubblegum";
import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
} from "@solana/spl-account-compression";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMint,
  getAccount,
  NATIVE_MINT,
} from "@solana/spl-token";
import BN from "bn.js";
import { TASK_QUEUE_ID } from "@/lib/constants/tuktuk";
import { AssetOwner, HotspotOwnership } from "@/lib/models/hotspot";
import { Recipient } from "@/lib/models/recipient";
import { MiniFanout } from "@/lib/models/mini-fanout";

// mpl-bubblegum's createTransferInstruction marks leafOwner with isSigner: false,
// but the on-chain program requires the leaf owner or delegate to sign.
// Without this fix, the compiled transaction won't include the leaf owner as a
// required signer, so the client never asks the wallet to sign it.
function markLeafOwnerAsSigner(
  ix: TransactionInstruction,
  leafOwner: PublicKey,
): TransactionInstruction {
  ix.keys = ix.keys.map((key) =>
    key.pubkey.equals(leafOwner) ? { ...key, isSigner: true } : key,
  );
  return ix;
}

const FANOUT_FUNDING_AMOUNT = solToLamportsBN(0.01).toNumber();
// Rent for an ATA (~0.00204 SOL). closeMiniFanoutV0 uses the owner as payer
// when creating the owner's token ATA, so we fund the owner if needed.
const ATA_RENT_LAMPORTS = 2_039_280;
const MAX_JITO_BUNDLE_TXS = 5;

let migrationAllowlist: Set<string> | null = null;

function loadMigrationAllowlist(): Set<string> {
  if (migrationAllowlist) return migrationAllowlist;

  const filePath = process.env.MIGRATION_ALLOWLIST_PATH;
  if (filePath) {
    const fs = require("fs");
    const wallets: string[] = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    migrationAllowlist = new Set(wallets);
  } else {
    migrationAllowlist = new Set();
  }
  return migrationAllowlist;
}

function isInMigrationAllowlist(wallet: string): boolean {
  return loadMigrationAllowlist().has(wallet);
}

async function getBubblegumAuthorityPDA(
  merkleRollPubKey: PublicKey,
): Promise<PublicKey> {
  const [bubblegumAuthorityPDAKey] = await PublicKey.findProgramAddress(
    [merkleRollPubKey.toBuffer()],
    BUBBLEGUM_PROGRAM_ID,
  );
  return bubblegumAuthorityPDAKey;
}

export const migrate = publicProcedure.migration.migrate.handler(
  async ({ input, errors }) => {
    const { sourceWallet, destinationWallet, hotspots, tokens, password } =
      input;

    // 3a. Validation — either wallet can be in the allowlist, or password bypasses it
    const passwordValid =
      !!password && !!env.MIGRATION_PASSWORD && password === env.MIGRATION_PASSWORD;
    if (
      !passwordValid &&
      !isInMigrationAllowlist(sourceWallet) &&
      !isInMigrationAllowlist(destinationWallet)
    ) {
      throw errors.UNAUTHORIZED({
        message: "Wallet is not in the migration allowlist",
      });
    }

    const sourcePubkey = new PublicKey(sourceWallet);
    const destPubkey = new PublicKey(destinationWallet);

    if (!env.FEE_PAYER_WALLET_PATH) {
      throw errors.BAD_REQUEST({
        message: "Fee payer wallet not configured",
      });
    }

    const feePayerKeypair = loadKeypair(env.FEE_PAYER_WALLET_PATH);
    const feePayer = feePayerKeypair.publicKey;

    const { provider: sourceProvider, connection } =
      createSolanaConnection(sourceWallet);
    // Provider with fee payer as wallet — used for batching (feePayer = provider.wallet.publicKey)
    const { provider } = createSolanaConnection(feePayer.toBase58());
    const assetEndpoint = env.ASSET_ENDPOINT || connection.rpcEndpoint;

    const warnings: string[] = [];

    // Token transfer instructions (always included in the first batch)
    const tokenTransferInstructions: TransactionInstruction[] = [];
    // Simple hotspot transfers tracked per-hotspot for incremental batching
    interface SimpleHotspotWork {
      hotspotPubkey: string;
      instructions: TransactionInstruction[];
    }
    const simpleHotspotWorkList: SimpleHotspotWork[] = [];

    interface SplitHotspotWork {
      hotspotPubkey: string;
      groups: TransactionInstruction[][]; // close, create, transfer groups
    }
    const splitHotspotWorkList: SplitHotspotWork[] = [];

    // 3c. Token Transfers
    for (const token of tokens) {
      const rawAmount = BigInt(token.amount);
      if (rawAmount <= BigInt(0)) continue;

      const isSol = token.mint === TOKEN_MINTS.WSOL;

      if (isSol) {
        tokenTransferInstructions.push(
          SystemProgram.transfer({
            fromPubkey: sourcePubkey,
            toPubkey: destPubkey,
            lamports: rawAmount,
          }),
        );
      } else {
        const mintKey = new PublicKey(token.mint);
        const sourceAta = getAssociatedTokenAddressSync(
          mintKey,
          sourcePubkey,
          true,
        );
        const destAta = getAssociatedTokenAddressSync(
          mintKey,
          destPubkey,
          true,
        );

        // Fee payer creates dest ATA
        tokenTransferInstructions.push(
          createAssociatedTokenAccountIdempotentInstruction(
            feePayer,
            destAta,
            destPubkey,
            mintKey,
          ),
        );

        const [mintInfo, sourceAtaInfo] = await Promise.all([
          getMint(connection, mintKey),
          getAccount(connection, sourceAta).catch(() => null),
        ]);

        // Skip frozen token accounts (e.g. DC tokens are frozen by the data credits program)
        if (sourceAtaInfo?.isFrozen) {
          warnings.push(
            `Skipping ${token.mint}: token account is frozen and cannot be transferred`,
          );
          continue;
        }

        tokenTransferInstructions.push(
          createTransferCheckedInstruction(
            sourceAta,
            mintKey,
            destAta,
            sourcePubkey,
            rawAmount,
            mintInfo.decimals,
          ),
        );

        // Close source ATA if transferring full balance (rent → fee payer)
        if (
          sourceAtaInfo &&
          BigInt(sourceAtaInfo.amount.toString()) === rawAmount
        ) {
          tokenTransferInstructions.push(
            createCloseAccountInstruction(sourceAta, feePayer, sourcePubkey),
          );
        }
      }
    }

    // 3d. Hotspot Transfers
    const ldProgram = await initLd(provider);
    const miniFanoutProgram = await initMiniFanout(provider);
    const tuktukProgram = await initTuktuk(provider);

    for (const hotspotPubkey of hotspots) {
      const assetId = await getAssetIdFromPubkey(hotspotPubkey);
      if (!assetId) {
        throw errors.NOT_FOUND({
          message: `Hotspot not found: ${hotspotPubkey}`,
        });
      }

      const assetPubkey = new PublicKey(assetId);

      // Detect mini fanout
      let miniFanoutAccount: any = null;
      let miniFanoutKey: PublicKey | null = null;
      let recipientAcc: any = null;
      const [recipientK] = recipientKey(
        new PublicKey(HNT_LAZY_DISTRIBUTOR_ADDRESS),
        assetPubkey,
      );

      if (env.NO_PG === "true") {
        // On-chain lookup
        recipientAcc =
          await ldProgram.account.recipientV0.fetchNullable(recipientK);
        if (
          recipientAcc &&
          !recipientAcc.destination.equals(PublicKey.default)
        ) {
          const destKey = recipientAcc.destination;
          miniFanoutAccount =
            await miniFanoutProgram.account.miniFanoutV0.fetchNullable(destKey);
          if (miniFanoutAccount) {
            miniFanoutKey = destKey;
          }
        }
      } else {
        await connectToDb();
        const assetOwner = await AssetOwner.findOne({
          where: { asset: assetId },
          include: [
            {
              model: Recipient,
              as: "recipient",
              required: false,
              include: [
                {
                  model: MiniFanout,
                  as: "split",
                  required: false,
                },
              ],
            },
          ],
        });

        if (assetOwner?.recipient?.split) {
          miniFanoutKey = new PublicKey(assetOwner.recipient.split.address);
          miniFanoutAccount =
            await miniFanoutProgram.account.miniFanoutV0.fetchNullable(
              miniFanoutKey,
            );
        }

        // Also fetch recipient on-chain if not found via DB
        if (!recipientAcc) {
          recipientAcc =
            await ldProgram.account.recipientV0.fetchNullable(recipientK);
        }
      }

      // Get cNFT proof for transfer
      const { asset, args, accounts, remainingAccounts } =
        await proofArgsAndAccounts({
          connection,
          assetId: assetPubkey,
          assetEndpoint,
        });

      if (!asset) {
        throw errors.NOT_FOUND({
          message: `Asset not found: ${assetId}`,
        });
      }

      const leafOwner =
        typeof asset.ownership.owner === "string"
          ? new PublicKey(asset.ownership.owner)
          : asset.ownership.owner;

      // Idempotency: skip if already transferred to destination
      if (leafOwner.equals(destPubkey)) continue;

      const leafDelegate = asset.ownership.delegate
        ? typeof asset.ownership.delegate === "string"
          ? new PublicKey(asset.ownership.delegate)
          : asset.ownership.delegate
        : leafOwner;

      const merkleTree = accounts.merkleTree;
      const treeAuthority = await getBubblegumAuthorityPDA(merkleTree);

      // If the source wallet doesn't own this hotspot, check if it's in a welcome pack
      let welcomePackCloseIx: TransactionInstruction | null = null;
      if (!leafOwner.equals(sourcePubkey)) {
        const wpProgram = await initWelcomePack(provider);
        const [userWelcomePacksK] = userWelcomePacksKey(sourcePubkey);
        const userWelcomePacksAcc =
          await wpProgram.account.userWelcomePacksV0.fetchNullable(
            userWelcomePacksK,
          );

        let foundWelcomePack = false;
        if (userWelcomePacksAcc) {
          for (let i = 0; i < (userWelcomePacksAcc.nextId || 0); i++) {
            const [wpKey] = welcomePackKey(sourcePubkey, i);
            const wp =
              await wpProgram.account.welcomePackV0.fetchNullable(wpKey);
            if (wp && wp.asset.equals(assetPubkey)) {
              const { instruction: ix } = await (
                await closeWelcomePack({
                  program: wpProgram,
                  welcomePack: wpKey,
                  getAssetFn: (_, id) => getAsset(assetEndpoint, id),
                  getAssetProofFn: (_, id) => getAssetProof(assetEndpoint, id),
                })
              ).prepare();
              welcomePackCloseIx = ix;
              foundWelcomePack = true;
              break;
            }
          }
        }

        if (!foundWelcomePack) {
          throw errors.BAD_REQUEST({
            message: `Hotspot ${hotspotPubkey}(${asset.content.metadata.name}) is owned by ${leafOwner.toBase58()}, not your wallet. It may be in a welcome pack that could not be resolved — try closing the welcome pack first, then migrate.`,
          });
        }
      }

      // After closing a welcome pack, the owner becomes sourcePubkey
      const effectiveLeafOwner = welcomePackCloseIx ? sourcePubkey : leafOwner;
      const effectiveLeafDelegate = welcomePackCloseIx
        ? sourcePubkey
        : leafDelegate;

      if (miniFanoutAccount && miniFanoutKey) {
        // Hotspot WITH mini fanout — collect all 3 groups per-hotspot
        // so we can enforce atomicity (all groups in the same Jito bundle)
        const groups: TransactionInstruction[][] = [];

        // Sub-group 1: close welcome pack (if needed) + fund source + close old fanout
        const closeGroup: TransactionInstruction[] = [];
        if (welcomePackCloseIx) {
          closeGroup.push(welcomePackCloseIx);
        }
        const sourceBalance = await connection.getBalance(sourcePubkey);
        if (sourceBalance < ATA_RENT_LAMPORTS) {
          closeGroup.push(
            SystemProgram.transfer({
              fromPubkey: feePayer,
              toPubkey: sourcePubkey,
              lamports: ATA_RENT_LAMPORTS - sourceBalance,
            }),
          );
        }
        const task = miniFanoutAccount.nextTask.equals(miniFanoutKey)
          ? null
          : await tuktukProgram.account.taskV0.fetchNullable(
              miniFanoutAccount.nextTask,
            );
        closeGroup.push(
          await miniFanoutProgram.methods
            .closeMiniFanoutV0()
            .accounts({
              miniFanout: miniFanoutKey,
              owner: sourcePubkey,
              taskRentRefund: task?.rentRefund || feePayer,
            })
            .instruction(),
        );
        groups.push(closeGroup);

        // Sub-group 2: create new fanout + fund + schedule
        const newShares = miniFanoutAccount.shares.map((share: any) => ({
          ...share,
          wallet: share.wallet.equals(sourcePubkey) ? destPubkey : share.wallet,
        }));
        const { instruction: initIx, pubkeys } = await miniFanoutProgram.methods
          .initializeMiniFanoutV0({
            seed: assetPubkey.toBuffer(),
            shares: newShares,
            schedule: miniFanoutAccount.schedule,
            preTask: miniFanoutAccount.preTask,
          })
          .accounts({
            payer: feePayer,
            owner: destPubkey,
            taskQueue: TASK_QUEUE_ID,
            rentRefund: feePayer,
            mint: HNT_MINT,
          })
          .prepare();
        const taskQueueAcc =
          await tuktukProgram.account.taskQueueV0.fetchNullable(TASK_QUEUE_ID);
        const [taskId, preTaskId] = nextAvailableTaskIds(
          taskQueueAcc!.taskBitmap,
          2,
        );
        const scheduleIx = await (
          await miniFanoutProgram.methods
            .scheduleTaskV0({
              program: miniFanoutProgram,
              miniFanout: pubkeys.miniFanout!,
              taskId,
              preTaskId,
            })
            .accounts({
              taskQueue: TASK_QUEUE_ID,
              payer: feePayer,
              miniFanout: pubkeys.miniFanout!,
              task: taskKey(TASK_QUEUE_ID, taskId)[0],
              preTask: taskKey(TASK_QUEUE_ID, preTaskId)[0],
              nextTask: pubkeys.miniFanout!,
              nextPreTask: pubkeys.miniFanout!,
            })
        ).instruction();
        groups.push([
          initIx,
          SystemProgram.transfer({
            fromPubkey: feePayer,
            toPubkey: pubkeys.miniFanout!,
            lamports: FANOUT_FUNDING_AMOUNT,
          }),
          scheduleIx,
        ]);

        // Sub-group 3: update destination + transfer cNFT
        const setRecipientIx = await (
          await updateCompressionDestination({
            program: ldProgram,
            assetId: assetPubkey,
            lazyDistributor: new PublicKey(HNT_LAZY_DISTRIBUTOR_ADDRESS),
            destination: pubkeys.miniFanout!,
            assetEndpoint,
          })
        ).instruction();
        groups.push([
          setRecipientIx,
          markLeafOwnerAsSigner(
            createTransferInstruction(
              {
                treeAuthority,
                leafOwner: effectiveLeafOwner,
                leafDelegate: effectiveLeafDelegate,
                newLeafOwner: destPubkey,
                merkleTree,
                logWrapper: SPL_NOOP_PROGRAM_ID,
                compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
                anchorRemainingAccounts: remainingAccounts,
              },
              {
                ...args,
                nonce: args.index,
              },
            ),
            effectiveLeafOwner,
          ),
        ]);

        splitHotspotWorkList.push({ hotspotPubkey, groups });
      } else {
        // Simple hotspot transfer (close welcome pack first if needed, then transfer)
        const ixs: TransactionInstruction[] = [];
        if (welcomePackCloseIx) {
          ixs.push(welcomePackCloseIx);
        }
        const transferIx = markLeafOwnerAsSigner(
          createTransferInstruction(
            {
              treeAuthority,
              leafOwner: effectiveLeafOwner,
              leafDelegate: effectiveLeafDelegate,
              newLeafOwner: destPubkey,
              merkleTree,
              logWrapper: SPL_NOOP_PROGRAM_ID,
              compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
              anchorRemainingAccounts: remainingAccounts,
            },
            {
              ...args,
              nonce: args.index,
            },
          ),
          effectiveLeafOwner,
        );

        // Simple transfers only need source signing
        ixs.push(transferIx);
        simpleHotspotWorkList.push({ hotspotPubkey, instructions: ixs });
      }
    }

    // 3e. Non-Owner Split Recipient Detection (DB only)
    if (env.NO_PG !== "true") {
      await connectToDb();

      const nonOwnerSplits = await HotspotOwnership.findAll({
        where: {
          destination: sourceWallet,
        },
        include: [
          {
            model: Recipient,
            as: "recipient",
            required: true,
            include: [
              {
                model: MiniFanout,
                as: "split",
                required: true,
              },
            ],
          },
        ],
      });

      // Filter to splits where source wallet is a recipient but NOT the asset owner
      const nonOwnerRecipientSplits = nonOwnerSplits.filter(
        (ho) => ho.assetOwner !== sourceWallet,
      );

      if (nonOwnerRecipientSplits.length > 0) {
        warnings.push(
          `You are a recipient of reward splits on hotspots you don't own. Contact your Deployer to update the split to send to your new wallet ${destinationWallet}. Come back after they've done that.`,
        );
      }
    }

    // 3f. Incremental batching + Jito tip + Sign
    const lut =
      process.env.NEXT_PUBLIC_SOLANA_CLUSTER === "devnet"
        ? HELIUM_COMMON_LUT_DEVNET
        : HELIUM_COMMON_LUT;
    const cluster = getCluster();

    // Work with TransactionDrafts (instructions + metadata) until the very end,
    // so we can easily append the Jito tip ix before converting to VersionedTransaction.
    const allDrafts: TransactionDraft[] = [];
    const txMetadata: {
      type: string;
      description: string;
    }[] = [];

    const batchOpts = {
      addressLookupTableAddresses: [lut],
      commitment: "finalized" as const,
    };

    // Step 1: Batch token transfers (always included — typically small)
    if (tokenTransferInstructions.length > 0) {
      const tokenDrafts = await batchInstructionsToTxsWithPriorityFee(
        provider,
        tokenTransferInstructions,
        batchOpts,
      );
      for (const draft of tokenDrafts) {
        allDrafts.push(draft);
        txMetadata.push({
          type: TRANSACTION_TYPES.MIGRATION,
          description: "Migration: transfers",
        });
      }
    }

    // Step 2: Batch simple hotspot transfers, respecting the bundle limit.
    // Try batching all simple hotspot instructions together for optimal packing.
    // If the result exceeds the limit, incrementally add hotspots until full.
    let includedSimpleCount = simpleHotspotWorkList.length;
    if (simpleHotspotWorkList.length > 0) {
      const allSimpleIxs = simpleHotspotWorkList.flatMap((w) => w.instructions);
      const simpleHotspotDrafts = await batchInstructionsToTxsWithPriorityFee(
        provider,
        allSimpleIxs,
        batchOpts,
      );

      if (allDrafts.length + simpleHotspotDrafts.length <= MAX_JITO_BUNDLE_TXS) {
        // All fit — add them all
        for (const draft of simpleHotspotDrafts) {
          allDrafts.push(draft);
          txMetadata.push({
            type: TRANSACTION_TYPES.MIGRATION,
            description: "Migration: transfers",
          });
        }
      } else {
        // Too many txs — incrementally add hotspots until we hit the limit
        includedSimpleCount = 0;
        const remainingSlots = MAX_JITO_BUNDLE_TXS - allDrafts.length;
        if (remainingSlots > 0) {
          const accumulatedIxs: TransactionInstruction[] = [];
          for (let i = 0; i < simpleHotspotWorkList.length; i++) {
            const nextIxs = [
              ...accumulatedIxs,
              ...simpleHotspotWorkList[i].instructions,
            ];
            const candidateDrafts =
              await batchInstructionsToTxsWithPriorityFee(
                provider,
                nextIxs,
                batchOpts,
              );

            if (allDrafts.length + candidateDrafts.length > MAX_JITO_BUNDLE_TXS) {
              break;
            }
            accumulatedIxs.push(...simpleHotspotWorkList[i].instructions);
            includedSimpleCount = i + 1;
          }

          // Batch the final set of included instructions
          if (accumulatedIxs.length > 0) {
            const finalDrafts = await batchInstructionsToTxsWithPriorityFee(
              provider,
              accumulatedIxs,
              batchOpts,
            );
            for (const draft of finalDrafts) {
              allDrafts.push(draft);
              txMetadata.push({
                type: TRANSACTION_TYPES.MIGRATION,
                description: "Migration: transfers",
              });
            }
          }
        }
      }
    }

    // Step 3: Incrementally add split hotspot txs, respecting the bundle limit.
    // Each split hotspot's groups must stay in the same bundle (atomicity).
    let includedSplitCount = 0;
    for (const work of splitHotspotWorkList) {
      const hotspotDrafts = await batchInstructionsToTxsWithPriorityFee(
        provider,
        work.groups,
        batchOpts,
      );

      if (allDrafts.length + hotspotDrafts.length > MAX_JITO_BUNDLE_TXS) {
        break;
      }

      includedSplitCount++;
      for (const draft of hotspotDrafts) {
        allDrafts.push(draft);
        txMetadata.push({
          type: TRANSACTION_TYPES.MIGRATION,
          description: "Migration: hotspot splits",
        });
      }
    }

    // Compute nextParams from remaining simple + split hotspots
    const remainingSimpleHotspots = simpleHotspotWorkList
      .slice(includedSimpleCount)
      .map((w) => w.hotspotPubkey);
    const remainingSplitHotspots = splitHotspotWorkList
      .slice(includedSplitCount)
      .map((w) => w.hotspotPubkey);
    const remainingHotspots = [
      ...remainingSimpleHotspots,
      ...remainingSplitHotspots,
    ];
    const nextParams =
      remainingHotspots.length > 0
        ? {
            sourceWallet,
            destinationWallet,
            hotspots: remainingHotspots,
            tokens: [] as { mint: string; amount: string }[],
          }
        : undefined;
    const hasMore = nextParams !== undefined;

    // Step 4: Inject Jito tip instruction into an existing draft.
    // Try each draft (prefer last) — if the tip fits, keep it. Otherwise try
    // the next. If no existing draft has room, add a dedicated tip draft only
    // if we haven't hit MAX_JITO_BUNDLE_TXS. If that's not possible, error out.
    const useJito = shouldUseJitoBundle(allDrafts.length, cluster);
    if (useJito && allDrafts.length > 0) {
      const tipIx = await getJitoTipInstruction(feePayer);
      let tipPlaced = false;

      // Try fitting the tip into an existing draft (last first, then others)
      for (let i = allDrafts.length - 1; i >= 0; i--) {
        allDrafts[i].instructions.push(tipIx);
        const testTx = toVersionedTx(allDrafts[i]);
        if (testTx.serialize().length <= 1232) {
          tipPlaced = true;
          break;
        }
        // Doesn't fit — revert and try the next draft
        allDrafts[i].instructions.pop();
      }

      if (!tipPlaced) {
        if (allDrafts.length < MAX_JITO_BUNDLE_TXS) {
          allDrafts.push({
            instructions: [tipIx],
            feePayer,
            addressLookupTableAddresses: [lut],
          } as TransactionDraft);
          txMetadata.push({
            type: TRANSACTION_TYPES.MIGRATION,
            description: "Migration: Jito tip",
          });
        } else {
          throw errors.BAD_REQUEST({
            message:
              "Unable to fit Jito tip instruction into the transaction bundle",
          });
        }
      }
    }

    // Step 5: Convert drafts to VersionedTransactions and sign with fee payer
    const allTxs = allDrafts.map((draft) => toVersionedTx(draft));

    // Determine which client wallets are required signers on a transaction
    function getRequiredClientSigners(
      tx: VersionedTransaction,
    ): ("source" | "destination")[] {
      const numRequired = tx.message.header.numRequiredSignatures;
      const requiredKeys = tx.message.staticAccountKeys
        .slice(0, numRequired)
        .map((k) => k.toBase58());
      const signers: ("source" | "destination")[] = [];
      if (requiredKeys.includes(sourceWallet)) signers.push("source");
      if (requiredKeys.includes(destinationWallet)) signers.push("destination");
      return signers;
    }

    for (const tx of allTxs) {
      tx.sign([feePayerKeypair]);
    }

    const tag = generateTransactionTag({
      type: TRANSACTION_TYPES.MIGRATION,
      sourceWallet,
      destinationWallet,
      timestamp: Date.now(),
    });

    const txFees = getTotalTransactionFees(allTxs);

    return {
      transactionData: {
        transactions: allTxs.map((tx, i) => ({
          serializedTransaction: Buffer.from(tx.serialize()).toString("base64"),
          metadata: {
            ...txMetadata[i],
            signers: getRequiredClientSigners(tx),
          },
        })),
        parallel: false,
        tag,
        actionMetadata: { type: "migration", sourceWallet, destinationWallet, hotspotCount: hotspots?.length ?? 0 },
      },
      estimatedSolFee: await toTokenAmountOutput(
        new BN(txFees),
        NATIVE_MINT.toBase58(),
      ),
      warnings: warnings.length > 0 ? warnings : undefined,
      hasMore,
      nextParams,
    };
  },
);
