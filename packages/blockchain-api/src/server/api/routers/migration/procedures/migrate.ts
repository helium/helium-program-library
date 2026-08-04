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
import { init as initVsr } from "@helium/voter-stake-registry-sdk";
import {
  delegatedPositionKey,
  init as initHsd,
} from "@helium/helium-sub-daos-sdk";
import { init as initProxy, proxyAssignmentKey } from "@helium/nft-proxy-sdk";
import {
  fetchRegistrarsByKey,
  getPositionsForOwner,
  type OwnedPosition,
} from "@/server/api/routers/governance/procedures/helpers";
import {
  batchInstructionsToTxsWithPriorityFee,
  chunks,
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
  unpackAccount,
  NATIVE_MINT,
} from "@solana/spl-token";
import BN from "bn.js";
import { headers } from "next/headers";
import {
  createRateLimiter,
  getClientIp,
  parseRateLimit,
} from "@/lib/utils/rate-limit";
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
  leafOwner: PublicKey
): TransactionInstruction {
  ix.keys = ix.keys.map((key) =>
    key.pubkey.equals(leafOwner) ? { ...key, isSigner: true } : key
  );
  return ix;
}

const FANOUT_FUNDING_AMOUNT = solToLamportsBN(0.01).toNumber();
// Rent for an ATA (~0.00204 SOL). closeMiniFanoutV0 uses the owner as payer
// when creating the owner's token ATA, so we fund the owner if needed.
const ATA_RENT_LAMPORTS = 2_039_280;
const MAX_JITO_BUNDLE_TXS = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

const migrationPairRateLimiter = createRateLimiter({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: () => parseRateLimit(process.env.MIGRATION_RATE_LIMIT_PER_PAIR, 30),
});
const migrationIpRateLimiter = createRateLimiter({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: () => parseRateLimit(process.env.MIGRATION_RATE_LIMIT_PER_IP, 60),
});

async function getBubblegumAuthorityPDA(
  merkleRollPubKey: PublicKey
): Promise<PublicKey> {
  const [bubblegumAuthorityPDAKey] = await PublicKey.findProgramAddress(
    [merkleRollPubKey.toBuffer()],
    BUBBLEGUM_PROGRAM_ID
  );
  return bubblegumAuthorityPDAKey;
}

export const migrate = publicProcedure.migration.migrate.handler(
  async ({ input, errors }) => {
    const { sourceWallet, destinationWallet, hotspots, tokens } = input;

    // Rate limit per wallet pair and per client IP. Pair is checked first; on a
    // trip we skip the IP check so a rejected request doesn't consume IP budget.
    // Both keys are ultimately caller-influenced (wallets are free to generate;
    // the IP key depends on the ingress's XFF handling) and the limiter is
    // per-process, so this is a courtesy throttle, not an abuse boundary.
    const headerStore = await headers();
    const clientIp = getClientIp(headerStore);
    if (
      !migrationPairRateLimiter(`${sourceWallet}:${destinationWallet}`) ||
      !migrationIpRateLimiter(clientIp)
    ) {
      throw errors.RATE_LIMITED();
    }

    const sourcePubkey = new PublicKey(sourceWallet);
    const destPubkey = new PublicKey(destinationWallet);

    if (sourcePubkey.equals(destPubkey)) {
      throw errors.BAD_REQUEST({
        message: "Source and destination wallets must be different",
      });
    }
    // Off-curve destinations (PDAs, exchange sub-accounts) can never sign, so
    // assets sent there — including years-locked governance positions — are
    // unrecoverable. Almost always a pasted-wrong address; reject outright.
    if (!PublicKey.isOnCurve(destPubkey.toBytes())) {
      throw errors.BAD_REQUEST({
        message:
          "Destination must be a standard wallet address (on-curve public key)",
      });
    }

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

    // Token transfers (first in the batch). Each token's create/transfer/close
    // instructions form one group so the batcher keeps them in a single tx — a
    // fee-payer-funded dest ATA can never land in a client-submittable tx
    // without its offsetting source-ATA close. The originating input token is
    // kept alongside so tokens that don't fit the bundle can be echoed back
    // via nextParams.
    interface TokenWork {
      token: { mint: string; amount: string };
      group: TransactionInstruction[];
    }
    const tokenWorkList: TokenWork[] = [];
    // VSR governance position transfers (after tokens). Each position's
    // transfer/close pair is grouped for the same reason.
    const positionTransferGroups: TransactionInstruction[][] = [];
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
    const seenTokenMints = new Set<string>();
    for (const token of tokens) {
      // A duplicate mint would build a second transfer against the source ATA
      // the first group just closed, failing the whole tx.
      if (seenTokenMints.has(token.mint)) continue;
      seenTokenMints.add(token.mint);

      const isSol = token.mint === TOKEN_MINTS.WSOL;

      if (isSol) {
        // The client amount is authoritative only for native SOL — for SPL
        // tokens it's advisory (we always move the full on-chain balance), so
        // only the SOL path gates on it.
        const rawAmount = BigInt(token.amount);
        if (rawAmount <= BigInt(0)) continue;
        tokenWorkList.push({
          token,
          group: [
            SystemProgram.transfer({
              fromPubkey: sourcePubkey,
              toPubkey: destPubkey,
              lamports: rawAmount,
            }),
          ],
        });
      } else {
        const mintKey = new PublicKey(token.mint);
        const sourceAta = getAssociatedTokenAddressSync(
          mintKey,
          sourcePubkey,
          true
        );
        const destAta = getAssociatedTokenAddressSync(
          mintKey,
          destPubkey,
          true
        );

        // The client-supplied amount is advisory for SPL tokens: we always move
        // the full on-chain balance and unconditionally close the source ATA so
        // its rent refund makes the migration rent-neutral for the fee payer.
        // Fetch state BEFORE pushing any instruction — a frozen or empty account
        // must not leave the fee payer paying unrefunded dest-ATA rent.
        const [mintInfo, sourceAtaInfo] = await Promise.all([
          // getMint throws on non-SPL-token owners (e.g. token-2022 mints,
          // which this endpoint doesn't support) — skip instead of 500ing.
          getMint(connection, mintKey).catch(() => null),
          getAccount(connection, sourceAta).catch(() => null),
        ]);

        if (!mintInfo) {
          warnings.push(
            `Skipping ${token.mint}: not a supported SPL token mint`
          );
          continue;
        }

        if (!sourceAtaInfo || sourceAtaInfo.amount <= BigInt(0)) {
          warnings.push(`Skipping ${token.mint}: no balance to migrate`);
          continue;
        }

        // Skip frozen token accounts (e.g. DC tokens are frozen by the data credits program)
        if (sourceAtaInfo.isFrozen) {
          warnings.push(
            `Skipping ${token.mint}: token account is frozen and cannot be transferred`
          );
          continue;
        }

        tokenWorkList.push({
          token,
          group: [
            createAssociatedTokenAccountIdempotentInstruction(
              feePayer,
              destAta,
              destPubkey,
              mintKey
            ),
            createTransferCheckedInstruction(
              sourceAta,
              mintKey,
              destAta,
              sourcePubkey,
              sourceAtaInfo.amount,
              mintInfo.decimals
            ),
            createCloseAccountInstruction(sourceAta, feePayer, sourcePubkey),
          ],
        });
      }
    }

    // 3c-2. Governance (VSR) position transfers. Enumerate every position the
    // source wallet owns (registrar-agnostic) and transfer each to the
    // destination. Enumeration re-reads on-chain state on every paginated call,
    // so already-migrated positions naturally drop out on subsequent calls.
    const vsrProgram = await initVsr(provider);
    const ownedPositions = await getPositionsForOwner({
      connection,
      vsrProgram,
      owner: sourcePubkey,
    });
    const sourceAtas = ownedPositions.map(({ mint }) =>
      getAssociatedTokenAddressSync(mint, sourcePubkey, true)
    );
    const destTokenAtas = ownedPositions.map(({ mint }) =>
      getAssociatedTokenAddressSync(mint, destPubkey, true)
    );
    // Enumeration can lag on-chain state (stale RPC index); confirm each source
    // ATA still holds the position NFT before building instructions, otherwise
    // TransferPositionV0 fails the whole batch with 3012. The destination ATA
    // is fetched too: a stale read can still show the NFT at the source after
    // a prior migration, and rebuilding the transfer would fail on the frozen
    // destination ATA. Batched into one fetch rather than a serial round trip
    // per position. getMultipleAccounts is capped at 100 keys per RPC call.
    const ataInfos = (
      await Promise.all(
        chunks([...sourceAtas, ...destTokenAtas], 100).map((c) =>
          connection.getMultipleAccountsInfo(c)
        )
      )
    ).flat();
    const sourceAtaInfos = ataInfos.slice(0, sourceAtas.length);
    const destAtaInfos = ataInfos.slice(sourceAtas.length);
    const migratingPositions: OwnedPosition[] = [];
    for (let i = 0; i < ownedPositions.length; i++) {
      const owned = ownedPositions[i];
      const { mint, position } = owned;
      const sourceAta = sourceAtas[i];
      // A malformed/foreign account at an ATA address is treated as absent,
      // matching the previous getAccount(...).catch(() => null) behavior.
      const tryUnpack = (ata: PublicKey, info: (typeof ataInfos)[number]) => {
        try {
          return info ? unpackAccount(ata, info) : null;
        } catch {
          return null;
        }
      };
      const sourceAtaInfo = tryUnpack(sourceAta, sourceAtaInfos[i]);
      if (!sourceAtaInfo || sourceAtaInfo.amount !== BigInt(1)) {
        continue;
      }
      // A frozen destination ATA holding the NFT proves the position already
      // arrived (only transferPositionV0 freezes it); the source read above
      // was stale. Skip instead of building a transfer that would fail.
      const destAtaInfo = tryUnpack(destTokenAtas[i], destAtaInfos[i]);
      if (destAtaInfo?.isFrozen && destAtaInfo.amount === BigInt(1)) {
        continue;
      }
      migratingPositions.push(owned);
      positionTransferGroups.push([
        await vsrProgram.methods
          .transferPositionV0()
          .accountsPartial({
            payer: feePayer,
            position,
            mint,
            from: sourcePubkey,
            to: destPubkey,
          })
          .instruction(),
        // The transfer leaves the source ATA empty and thawed; closing it
        // refunds rent to the fee payer, keeping the migration rent-neutral.
        createCloseAccountInstruction(sourceAta, feePayer, sourcePubkey),
      ]);
    }

    // Live governance attachments survive the NFT transfer silently: an
    // assigned proxy keeps voting the position's weight until revoked, and
    // delegation reward automation set up from the old wallet stops working.
    // Neither blocks the transfer, so surface warnings instead.
    if (migratingPositions.length > 0) {
      const hsdProgram = await initHsd(provider);
      const delegatedAccs =
        await hsdProgram.account.delegatedPositionV0.fetchMultiple(
          migratingPositions.map((p) => delegatedPositionKey(p.position)[0])
        );
      const delegatedCount = delegatedAccs.filter((acc) => acc !== null).length;
      if (delegatedCount > 0) {
        warnings.push(
          `${delegatedCount} governance position(s) are delegated. Delegation follows the position to the new wallet, but any automated reward claiming set up from the old wallet will stop — claim or re-delegate from the new wallet.`
        );
      }

      // Registrars are shared across positions — fetch each unique one once to
      // resolve its proxy config.
      const registrarByKey = await fetchRegistrarsByKey(
        vsrProgram,
        migratingPositions
      );

      const assignmentKeys = migratingPositions
        .map(({ mint, account: acc }) => {
          const proxyConfig = registrarByKey.get(
            acc.registrar.toBase58()
          )?.proxyConfig;
          return proxyConfig
            ? proxyAssignmentKey(proxyConfig, mint, PublicKey.default)[0]
            : null;
        })
        .filter((key): key is PublicKey => key !== null);
      if (assignmentKeys.length > 0) {
        const proxyProgram = await initProxy(provider);
        const assignments =
          await proxyProgram.account.proxyAssignmentV0.fetchMultiple(
            assignmentKeys
          );
        const proxiedCount = assignments.filter(
          (acc) => acc && !acc.nextVoter.equals(PublicKey.default)
        ).length;
        if (proxiedCount > 0) {
          warnings.push(
            `${proxiedCount} governance position(s) have an active voting proxy that survives migration and keeps voting their weight until revoked. Revoke or reassign the proxy from the new wallet if this is not intended.`
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
        assetPubkey
      );

      if (env.NO_PG === "true") {
        // On-chain lookup
        recipientAcc = await ldProgram.account.recipientV0.fetchNullable(
          recipientK
        );
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
              miniFanoutKey
            );
        }

        // Also fetch recipient on-chain if not found via DB
        if (!recipientAcc) {
          recipientAcc = await ldProgram.account.recipientV0.fetchNullable(
            recipientK
          );
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
            userWelcomePacksK
          );

        let foundWelcomePack = false;
        if (userWelcomePacksAcc) {
          for (let i = 0; i < (userWelcomePacksAcc.nextId || 0); i++) {
            const [wpKey] = welcomePackKey(sourcePubkey, i);
            const wp = await wpProgram.account.welcomePackV0.fetchNullable(
              wpKey
            );
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
            message: `Hotspot ${hotspotPubkey}(${
              asset.content.metadata.name
            }) is owned by ${leafOwner.toBase58()}, not your wallet. It may be in a welcome pack that could not be resolved — try closing the welcome pack first, then migrate.`,
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
            })
          );
        }
        const task = miniFanoutAccount.nextTask.equals(miniFanoutKey)
          ? null
          : await tuktukProgram.account.taskV0.fetchNullable(
              miniFanoutAccount.nextTask
            );
        closeGroup.push(
          await miniFanoutProgram.methods
            .closeMiniFanoutV0()
            .accounts({
              miniFanout: miniFanoutKey,
              owner: sourcePubkey,
              taskRentRefund: task?.rentRefund || feePayer,
            })
            .instruction()
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
          2
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
              }
            ),
            effectiveLeafOwner
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
            }
          ),
          effectiveLeafOwner
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
        (ho) => ho.assetOwner !== sourceWallet
      );

      if (nonOwnerRecipientSplits.length > 0) {
        warnings.push(
          `You are a recipient of reward splits on hotspots you don't own. Contact your Deployer to update the split to send to your new wallet ${destinationWallet}. Come back after they've done that.`
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

    const addDrafts = (drafts: TransactionDraft[], description: string) => {
      for (const draft of drafts) {
        allDrafts.push(draft);
        txMetadata.push({ type: TRANSACTION_TYPES.MIGRATION, description });
      }
    };

    // Incrementally include instruction groups until batching one more would
    // push the bundle past maxTxs. Groups are indivisible (fee-payer-funded
    // create/close pairs), so exclusion is all-or-nothing per group.
    const fitGroupsWithinLimit = async (
      groups: TransactionInstruction[][],
      maxTxs: number
    ): Promise<{ drafts: TransactionDraft[]; includedCount: number }> => {
      if (groups.length === 0 || maxTxs <= 0)
        return { drafts: [], includedCount: 0 };
      const batched = await batchInstructionsToTxsWithPriorityFee(
        provider,
        groups,
        batchOpts
      );
      if (batched.length <= maxTxs) {
        return { drafts: batched, includedCount: groups.length };
      }
      // Tx count is monotonic in prefix length, so binary-search the largest
      // fitting prefix instead of re-batching (RPC-backed fee estimation) for
      // every prefix. lo is always a known-fitting count, hi a known overflow.
      let lo = 0;
      let hi = groups.length;
      let drafts: TransactionDraft[] = [];
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        const candidate = await batchInstructionsToTxsWithPriorityFee(
          provider,
          groups.slice(0, mid),
          batchOpts
        );
        if (candidate.length <= maxTxs) {
          lo = mid;
          drafts = candidate;
        } else {
          hi = mid;
        }
      }
      return { drafts, includedCount: lo };
    };

    // Step 1: Batch token transfers, respecting the bundle limit. Tokens that
    // don't fit are echoed back via nextParams.tokens for the next call.
    const { drafts: tokenDrafts, includedCount: includedTokenCount } =
      await fitGroupsWithinLimit(
        tokenWorkList.map((w) => w.group),
        MAX_JITO_BUNDLE_TXS
      );
    addDrafts(tokenDrafts, "Migration: transfers");

    // Step 1b: Batch governance position transfers (before hotspots),
    // respecting the bundle limit. Positions that don't fit only need hasMore
    // set — they're auto-enumerated, so the next call re-discovers them while
    // already-migrated ones drop out.
    const { drafts: positionDrafts, includedCount: includedPositionCount } =
      await fitGroupsWithinLimit(
        positionTransferGroups,
        MAX_JITO_BUNDLE_TXS - allDrafts.length
      );
    addDrafts(positionDrafts, "Migration: transfers");
    const hasMorePositions =
      includedPositionCount < positionTransferGroups.length;

    // Step 2: Batch simple hotspot transfers, respecting the bundle limit.
    // Grouping per hotspot keeps each welcome-pack close with its transfer in
    // one tx while still letting the batcher pack multiple hotspots together.
    const { drafts: simpleHotspotDrafts, includedCount: includedSimpleCount } =
      await fitGroupsWithinLimit(
        simpleHotspotWorkList.map((w) => w.instructions),
        MAX_JITO_BUNDLE_TXS - allDrafts.length
      );
    addDrafts(simpleHotspotDrafts, "Migration: transfers");

    // Step 3: Incrementally add split hotspot txs, respecting the bundle limit.
    // Each split hotspot's groups must stay in the same bundle (atomicity).
    let includedSplitCount = 0;
    for (const work of splitHotspotWorkList) {
      const hotspotDrafts = await batchInstructionsToTxsWithPriorityFee(
        provider,
        work.groups,
        batchOpts
      );

      if (allDrafts.length + hotspotDrafts.length > MAX_JITO_BUNDLE_TXS) {
        break;
      }

      includedSplitCount++;
      addDrafts(hotspotDrafts, "Migration: hotspot splits");
    }

    // Compute nextParams from remaining tokens + simple + split hotspots.
    // Remaining positions don't appear in nextParams (they're auto-enumerated)
    // but still require a follow-up call.
    const remainingTokens = tokenWorkList
      .slice(includedTokenCount)
      .map((w) => w.token);
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
      remainingHotspots.length > 0 ||
      remainingTokens.length > 0 ||
      hasMorePositions
        ? {
            sourceWallet,
            destinationWallet,
            hotspots: remainingHotspots,
            tokens: remainingTokens,
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
            instructions: [
              // A tip-only tx would be fully signed by the fee payer alone,
              // letting anyone who calls this open endpoint submit it
              // standalone and drain tip + fees from the fee payer. Require
              // the source wallet's signature via a no-op self-transfer so
              // the tx is only valid as part of the client-signed bundle.
              SystemProgram.transfer({
                fromPubkey: sourcePubkey,
                toPubkey: sourcePubkey,
                lamports: 0,
              }),
              tipIx,
            ],
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
      tx: VersionedTransaction
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
        actionMetadata: {
          type: "migration",
          sourceWallet,
          destinationWallet,
          hotspotCount: hotspots?.length ?? 0,
        },
      },
      estimatedSolFee: await toTokenAmountOutput(
        new BN(txFees),
        NATIVE_MINT.toBase58()
      ),
      warnings: warnings.length > 0 ? warnings : undefined,
      hasMore,
      nextParams,
    };
  }
);
