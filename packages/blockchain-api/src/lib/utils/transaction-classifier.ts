import {
  BorshInstructionCoder,
  BorshAccountsCoder,
  Program,
  Idl,
} from "@coral-xyz/anchor";
import { convertIdlToCamelCase } from "@coral-xyz/anchor/dist/cjs/idl";
import { PublicKey, Connection } from "@solana/web3.js";
import { fetchBackwardsCompatibleIdl } from "@helium/spl-utils";
import { convertLegacyIdl } from "@helium/sus";
import { recipientKey } from "@helium/lazy-distributor-sdk";
import { HNT_LAZY_DISTRIBUTOR_ADDRESS } from "../constants/lazy-distributor";
import bs58 from "bs58";
import type { HeliusTransaction } from "./helius";

export interface TokenTransfer {
  mint: string;
  amount: number;
  from: string;
  to: string;
  tokenName?: string;
}

export interface ClassifiedTransaction {
  actionType: string;
  actionMetadata: Record<string, unknown>;
}

const BUBBLEGUM_PROGRAM_ID =
  "BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY";
const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const LAZY_DISTRIBUTOR_PROGRAM_ID =
  "1azyuavdMyvsivtNxPoz6SucD18eDHeXzFCUPq5XU7w";
const HELIUM_SUB_DAOS_PROGRAM_ID =
  "hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR";
const MINI_FANOUT_PROGRAM_ID =
  "mfanLprNnaiP4RX9Zz1BMcDosYHCqnG24H1fMEbi9Gn";

const LAZY_DISTRIBUTOR_DISTRIBUTE_INSTRUCTIONS = new Set([
  "distributeCompressionRewardsV0",
  "distributeCustomDestinationV0",
  "distributeRewardsV0",
]);

const HSD_INSTRUCTIONS = new Set([
  "claimRewardsV1"
])

const MINI_FANOUT_DISTRIBUTE_INSTRUCTION = "distributeV0";

const KNOWN_TOKEN_NAMES: Record<string, string> = {
  hntyVP6YFm1Hg25TN9WGLqM12b8TQv3XP931pR9s263: "HNT",
  "11111111111111111111111111111111": "SOL",
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  iotEVVZLEywoTn1QdwNPddxPWszn3zFhEot3MfL9o2t: "IOT",
  mb1eu7TzEc71KxDpsmsKoucSSuuoGLv1drys1oP2jh6: "MOBILE",
  So11111111111111111111111111111111111111112: "SOL",
};

// Programs that fetchBackwardsCompatibleIdl has bundled IDLs for
const HELIUM_PROGRAMS: Record<string, string> = {
  "1azyuavdMyvsivtNxPoz6SucD18eDHeXzFCUPq5XU7w": "lazy_distributor",
  hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR: "helium_sub_daos",
  credMBJhYFzfn7NxBMdU4aUqFggAjgztaCcv2Fo6fPT: "data_credits",
  hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8: "helium_entity_manager",
  circAbx64bbsscPbQzZAUvuXpHqrCe6fLMzc2uKXz9g: "circuit_breaker",
  treaf4wWBBty3fHdyBpo35Mz84M8k3heKXmjmi9vFt5: "treasury_management",
  porcSnvH9pvcYPmQ65Y8qcZSRxQBiBBQX7UV5nmBegy: "price_oracle",
  rorcfdX4h9m9swCKgcypaHJ8NGYVANBpmV9EHn3cYrF: "rewards_oracle",
  hvsrNC3NKbcryqDs2DocYHZ9yPKEVzdSjQG6RVtK1s8: "voter_stake_registry",
  fanqeMu3fw8R4LwKNbahPtYXJsyLL6NXyfe2BqzhfB6: "fanout",
  memMa1HG4odAFmUbGWfPwS1WWfK95k99F2YTkGvyxZr: "mobile_entity_manager",
  hexbnKYoA2GercNNhHUCCfrTRWrHjT6ujKPXTa5NPqJ: "hexboosting",
  noEmmgLmQdk6DLiPV8CSwQv3qQDyGEhz9m5A4zhtByv: "no_emit",
  propFYxqmVcufMhk5esNMrexq2ogHbbC2kP9PU1qxKs: "proposal",
  stcfiqW3fwD9QCd8Bqr1NBLrs7dftZHBQe7RiMMA4aM: "state_controller",
  nprx42sXf5rpVnwBWEdRg1d8tuCWsTuVLys1pRWwE6p: "nft_proxy",
  orgdXvHVLkWgBYerptASkAwkZAE563CJUu717dMNx5f: "organization",
  mfanLprNnaiP4RX9Zz1BMcDosYHCqnG24H1fMEbi9Gn: "mini_fanout",
};

// Programs we always skip (infrastructure, not user-facing actions)
const SKIP_PROGRAMS = new Set([
  "ComputeBudget111111111111111111111111111111",
  SYSTEM_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  "noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV",
  "cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK",
]);

// Cache fetched IDLs
const idlCache = new Map<string, Idl | null>();

async function fetchIdl(
  programId: string,
  connection: Connection,
): Promise<Idl | null> {
  if (idlCache.has(programId)) {
    return idlCache.get(programId)!;
  }

  try {
    const pubkey = new PublicKey(programId);
    const provider = { connection } as any;
    let idl: Idl | null;

    if (programId in HELIUM_PROGRAMS) {
      const raw = (await fetchBackwardsCompatibleIdl(pubkey, provider)) as Idl | null;
      // fetchBackwardsCompatibleIdl may return a new-format IDL (with address field,
      // snake_case names) from the on-chain account. Normalize to camelCase.
      if (raw?.address) {
        idl = convertIdlToCamelCase(raw);
      } else if (raw && !raw.address) {
        idl = convertIdlToCamelCase(convertLegacyIdl(raw as any, programId));
      } else {
        idl = null;
      }
    } else {
      const idlRaw = await Program.fetchIdl(pubkey, provider);
      if (!idlRaw) {
        idlCache.set(programId, null);
        return null;
      }
      if (!idlRaw.address) {
        idl = convertIdlToCamelCase(
          convertLegacyIdl(idlRaw as any, programId),
        );
      } else {
        idl = convertIdlToCamelCase(idlRaw);
      }
    }

    idlCache.set(programId, idl);
    return idl;
  } catch (error) {
    console.error(`Failed to fetch IDL for ${programId}:`, error);
    idlCache.set(programId, null);
    return null;
  }
}

function decodeInstruction(
  idl: Idl,
  data: string,
): { name: string; data: Record<string, any> } | null {
  try {
    const coder = new BorshInstructionCoder(idl);
    return coder.decode(data, "base58");
  } catch {
    return null;
  }
}

/**
 * Get the full combined account keys list for a transaction:
 * message.accountKeys + meta.loadedAddresses.writable + meta.loadedAddresses.readonly
 *
 * Inner instruction account indices and programIdIndex reference this combined list.
 */
function getAccountKeys(tx: HeliusTransaction): string[] {
  const message = tx.transaction?.message as any;
  if (!message) return [];

  let staticKeys: string[];
  if (message.accountKeys?.[0]?.pubkey) {
    staticKeys = message.accountKeys.map((k: any) =>
      typeof k.pubkey === "string" ? k.pubkey : k.pubkey?.toBase58?.() || "",
    );
  } else if (typeof message.accountKeys?.[0] === "string") {
    staticKeys = message.accountKeys;
  } else {
    return [];
  }

  // Append address lookup table entries
  const loaded = (tx.meta as any)?.loadedAddresses;
  if (loaded) {
    const resolve = (addr: any): string =>
      typeof addr === "string" ? addr : addr?.toBase58?.() || "";
    if (loaded.writable) {
      staticKeys = [...staticKeys, ...loaded.writable.map(resolve)];
    }
    if (loaded.readonly) {
      staticKeys = [...staticKeys, ...loaded.readonly.map(resolve)];
    }
  }

  return staticKeys;
}

/**
 * Resolve the program ID for an instruction.
 * Top-level instructions use `programId` (string or PublicKey).
 * Inner instructions use `programIdIndex` (number into combined account keys).
 */
function getIxProgramId(ix: any, accountKeys?: string[]): string {
  // Top-level: programId is a string or PublicKey
  if (ix.programId != null) {
    return typeof ix.programId === "string"
      ? ix.programId
      : ix.programId?.toBase58?.() || "";
  }
  // Inner: programIdIndex is a number into the combined account keys
  if (typeof ix.programIdIndex === "number" && accountKeys) {
    return accountKeys[ix.programIdIndex] || "";
  }
  return "";
}

/**
 * Resolve account pubkey at a given index within an instruction.
 * Inner instructions store account references as numeric indices into
 * the transaction's accountKeys; top-level may use strings or objects.
 */
function resolveIxAccount(
  ix: any,
  accountIndex: number,
  tx: HeliusTransaction,
): string {
  const accounts = ix.accounts || [];
  const value = accounts[accountIndex];
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") {
    return getAccountKeys(tx)[value] || "";
  }
  return value?.toBase58?.() || "";
}

function getAllInstructions(tx: HeliusTransaction): any[] {
  const instructions = (tx.transaction?.message as any)?.instructions || [];
  return [
    ...instructions,
    ...(tx.meta?.innerInstructions ?? []).flatMap(
      (inner) => inner.instructions,
    ),
  ];
}

function getInvolvedProgramIds(tx: HeliusTransaction): Set<string> {
  const accountKeys = getAccountKeys(tx);
  return new Set(
    getAllInstructions(tx)
      .map((ix) => getIxProgramId(ix, accountKeys))
      .filter(Boolean),
  );
}

// SPL Token instruction discriminators
const SPL_TRANSFER = 3;
const SPL_TRANSFER_CHECKED = 12;

/**
 * Build a lookup from token account (ATA) address → { owner, mint, decimals }
 * using the transaction's pre/post token balance entries.
 */
function buildAtaOwnerMap(
  tx: HeliusTransaction,
): Map<string, { owner: string; mint: string; decimals: number }> {
  const accountKeys = getAccountKeys(tx);
  const meta = tx.meta;
  const map = new Map<string, { owner: string; mint: string; decimals: number }>();
  if (!meta) return map;

  // Use both pre and post balances to cover newly-created ATAs
  const allBalances = [
    ...(meta.preTokenBalances ?? []),
    ...(meta.postTokenBalances ?? []),
  ];
  for (const bal of allBalances) {
    const ata = accountKeys[bal.accountIndex];
    if (ata && bal.owner && bal.mint && !map.has(ata)) {
      map.set(ata, {
        owner: bal.owner,
        mint: bal.mint,
        decimals: bal.uiTokenAmount?.decimals ?? 0,
      });
    }
  }
  return map;
}

/**
 * Extract token transfers from SPL Token instructions across all instructions
 * (including inner). Handles both formats returned by Solana RPC:
 *
 * 1. Parsed (jsonParsed encoding): { parsed: { type: "transfer", info: { source, destination, amount } } }
 * 2. Raw (binary encoding): data field with discriminator byte + u64 amount
 */
function getTokenTransfers(tx: HeliusTransaction): TokenTransfer[] {
  const ataMap = buildAtaOwnerMap(tx);
  const accountKeys = getAccountKeys(tx);
  const allIxs = getAllInstructions(tx);

  return allIxs.flatMap((ix) => {
    const pid = getIxProgramId(ix, accountKeys);
    const isSplToken = pid === TOKEN_PROGRAM_ID || ix.program === "spl-token";
    if (!isSplToken) return [];

    // --- Parsed format (Helius jsonParsed) ---
    if (ix.parsed) {
      const ptype = ix.parsed.type;
      if (ptype !== "transfer" && ptype !== "transferChecked") return [];

      const info = ix.parsed.info;
      if (!info?.source || !info?.destination) return [];

      const sourceEntry = ataMap.get(info.source);
      const destEntry = ataMap.get(info.destination);
      if (!sourceEntry || !destEntry) return [];

      let amount: number;
      let mint: string;
      if (ptype === "transferChecked" && info.tokenAmount) {
        amount = info.tokenAmount.uiAmount ?? 0;
        mint = info.mint || sourceEntry.mint;
      } else {
        amount =
          parseInt(info.amount, 10) / Math.pow(10, sourceEntry.decimals);
        mint = sourceEntry.mint;
      }

      return [
        {
          mint,
          amount,
          from: sourceEntry.owner,
          to: destEntry.owner,
          tokenName: KNOWN_TOKEN_NAMES[mint],
        },
      ];
    }

    // --- Raw format (binary data) ---
    if (!ix.data) return [];

    let data: Buffer;
    try {
      data = Buffer.from(bs58.decode(ix.data));
    } catch {
      return [];
    }

    if (data.length < 9) return [];
    const discriminator = data[0];
    if (discriminator !== SPL_TRANSFER && discriminator !== SPL_TRANSFER_CHECKED)
      return [];

    const rawAmount = data.readBigUInt64LE(1);

    let sourceAta: string;
    let destAta: string;

    if (discriminator === SPL_TRANSFER) {
      sourceAta = resolveIxAccount(ix, 0, tx);
      destAta = resolveIxAccount(ix, 1, tx);
    } else {
      sourceAta = resolveIxAccount(ix, 0, tx);
      destAta = resolveIxAccount(ix, 2, tx);
    }

    const sourceEntry = ataMap.get(sourceAta);
    const destEntry = ataMap.get(destAta);
    if (!sourceEntry || !destEntry) return [];

    const decimals =
      discriminator === SPL_TRANSFER_CHECKED && data.length >= 10
        ? data[9]
        : sourceEntry.decimals;
    const amount = Number(rawAmount) / Math.pow(10, decimals);
    const mint = sourceEntry.mint;

    return [
      {
        mint,
        amount,
        from: sourceEntry.owner,
        to: destEntry.owner,
        tokenName: KNOWN_TOKEN_NAMES[mint],
      },
    ];
  });
}

/**
 * Verify that a mini fanout is attached to a hotspot by checking if
 * a lazy distributor RecipientV0 exists whose destination matches
 * the mini fanout address.
 *
 * 1. Fetch & decode the MiniFanoutV0 account to get the `seed` (asset pubkey)
 * 2. Derive the RecipientV0 PDA for that asset under the HNT lazy distributor
 * 3. Fetch & decode the RecipientV0 and check its `destination` == mini fanout
 */
async function isHotspotMiniFanout(
  miniFanoutAddress: string,
  miniFanoutIdl: Idl,
  connection: Connection,
): Promise<boolean> {
  try {
    // 1. Fetch and decode the mini fanout account
    const fanoutInfo = await connection.getAccountInfo(
      new PublicKey(miniFanoutAddress),
    );
    if (!fanoutInfo?.data) return false;

    const fanoutCoder = new BorshAccountsCoder(miniFanoutIdl);
    const fanout = fanoutCoder.decode("miniFanoutV0", fanoutInfo.data);
    const seed: number[] | Buffer | Uint8Array | undefined = fanout.seed;
    if (!seed || seed.length !== 32) return false;

    // 2. Derive the recipient PDA for this asset under the HNT lazy distributor
    const assetPubkey = new PublicKey(Buffer.from(seed));
    const [recipientPda] = recipientKey(
      new PublicKey(HNT_LAZY_DISTRIBUTOR_ADDRESS),
      assetPubkey,
    );

    // 3. Fetch and decode the recipient to verify destination
    const ldIdl = await fetchIdl(LAZY_DISTRIBUTOR_PROGRAM_ID, connection);
    if (!ldIdl) return false;

    const recipientInfo = await connection.getAccountInfo(recipientPda);
    if (!recipientInfo?.data) return false;

    const ldCoder = new BorshAccountsCoder(ldIdl);
    const recipient = ldCoder.decode("recipientV0", recipientInfo.data);

    return (
      recipient.destination &&
      new PublicKey(recipient.destination).toBase58() === miniFanoutAddress
    );
  } catch {
    return false;
  }
}

/**
 * Compute the net token balance change for a given wallet across a transaction.
 * Returns one entry per mint the wallet holds in this tx, even if the delta is 0.
 * Returns null if the wallet has no token balance entries at all (not involved).
 * Populates `from` with the account whose balance decreased most for that mint.
 */
function getWalletBalanceChanges(
  tx: HeliusTransaction,
  wallet: string,
): TokenTransfer[] | null {
  const meta = tx.meta;
  if (!meta?.preTokenBalances || !meta?.postTokenBalances) return null;

  // Track wallet's balances per mint
  const walletPreByMint = new Map<string, number>();
  const walletPostByMint = new Map<string, number>();
  // Track all owners' balance deltas per mint to find the sender
  const deltasByMint = new Map<string, Map<string, number>>();

  for (const bal of meta.preTokenBalances) {
    if (!bal.owner || !bal.mint) continue;
    if (bal.owner === wallet) {
      walletPreByMint.set(bal.mint, bal.uiTokenAmount?.uiAmount ?? 0);
    }
    const mintDeltas = deltasByMint.get(bal.mint) ?? new Map<string, number>();
    mintDeltas.set(
      bal.owner,
      (mintDeltas.get(bal.owner) ?? 0) - (bal.uiTokenAmount?.uiAmount ?? 0),
    );
    deltasByMint.set(bal.mint, mintDeltas);
  }
  for (const bal of meta.postTokenBalances) {
    if (!bal.owner || !bal.mint) continue;
    if (bal.owner === wallet) {
      walletPostByMint.set(bal.mint, bal.uiTokenAmount?.uiAmount ?? 0);
    }
    const mintDeltas = deltasByMint.get(bal.mint) ?? new Map<string, number>();
    mintDeltas.set(
      bal.owner,
      (mintDeltas.get(bal.owner) ?? 0) + (bal.uiTokenAmount?.uiAmount ?? 0),
    );
    deltasByMint.set(bal.mint, mintDeltas);
  }

  const walletMints = new Set([
    ...walletPreByMint.keys(),
    ...walletPostByMint.keys(),
  ]);
  if (walletMints.size === 0) return null;

  return [...walletMints].map((mint) => {
    // Find the account with the largest negative delta (the sender)
    const deltas = deltasByMint.get(mint);
    let from = "";
    if (deltas) {
      let largestDrop = 0;
      for (const [owner, delta] of deltas) {
        if (owner !== wallet && delta < largestDrop) {
          largestDrop = delta;
          from = owner;
        }
      }
    }

    return {
      mint,
      amount: (walletPostByMint.get(mint) ?? 0) - (walletPreByMint.get(mint) ?? 0),
      from,
      to: wallet,
      tokenName: KNOWN_TOKEN_NAMES[mint],
    };
  });
}

/**
 * Classify a raw Solana transaction using IDL-based instruction decoding.
 *
 * @param wallet - If provided, rewards distributions are only classified when
 *                 the wallet is a recipient of the transfer.
 *
 * Priority:
 * 1. Rewards distribution (lazy distributor distribute or hotspot-attached
 *    mini fanout distribute, including nested via tuktuk)
 * 2. Decode the primary (non-infra) program instruction via IDL
 * 3. Bubblegum transfer (Metaplex program, not Helium)
 * 4. SPL token transfer from parsed transfer instructions
 * 5. Native SOL transfer
 */
export async function classifyTransaction(
  tx: HeliusTransaction,
  connection?: Connection,
  wallet?: string,
): Promise<ClassifiedTransaction | null> {
  const instructions = (tx.transaction?.message as any)?.instructions || [];
  const accountKeys = getAccountKeys(tx);
  const programIds = getInvolvedProgramIds(tx);
  const tokenTransfers = getTokenTransfers(tx);

  // 1. Rewards distribution: lazy distributor or hotspot-attached mini fanout
  //    These may be nested inside tuktuk tasks, so check all instructions
  if (connection) {
    const allIxs = getAllInstructions(tx);
    for (const ix of allIxs) {
      const pid = getIxProgramId(ix, accountKeys);
      if (!ix.data) continue;

      // --- Lazy distributor distribute instructions ---
      if (pid === LAZY_DISTRIBUTOR_PROGRAM_ID) {
        const idl = await fetchIdl(pid, connection);
        if (!idl) continue;

        const decoded = decodeInstruction(idl, ix.data);
        if (
          !decoded ||
          !LAZY_DISTRIBUTOR_DISTRIBUTE_INSTRUCTIONS.has(decoded.name)
        )
          continue;

        // Use direct SPL transfers to wallet, falling back to net balance changes.
        // If the wallet has no token balance entries at all, this tx isn't relevant
        // to them (e.g. lazy distributor sent to a mini fanout, not the wallet) —
        // return null so it doesn't fall through to generic classification.
        const directTransfers = wallet
          ? tokenTransfers.filter((t) => t.to === wallet)
          : tokenTransfers;
        let transfers: TokenTransfer[];
        if (directTransfers.length > 0 || !wallet) {
          transfers = directTransfers;
        } else {
          const balanceChanges = getWalletBalanceChanges(tx, wallet);
          if (!balanceChanges) return null;
          transfers = balanceChanges;
        }

        return {
          actionType: "rewards_distribution",
          actionMetadata: {
            program: "lazy_distributor",
            instruction: decoded.name,
            transfers,
          },
        };
      }

      // --- HSD claim rewards instructions ---
      if (pid === HELIUM_SUB_DAOS_PROGRAM_ID) {
        const idl = await fetchIdl(pid, connection);
        if (!idl) continue;

        const decoded = decodeInstruction(idl, ix.data);
        if (
          !decoded ||
          !HSD_INSTRUCTIONS.has(decoded.name)
        )
          continue;

        const directTransfers = wallet
          ? tokenTransfers.filter((t) => t.to === wallet)
          : tokenTransfers;
        let transfers: TokenTransfer[];
        if (directTransfers.length > 0 || !wallet) {
          transfers = directTransfers;
        } else {
          const balanceChanges = getWalletBalanceChanges(tx, wallet);
          if (!balanceChanges) return null;
          transfers = balanceChanges;
        }

        return {
          actionType: "delegation_rewards_distribution",
          actionMetadata: {
            program: "helium_sub_daos",
            instruction: decoded.name,
            transfers,
          },
        };
      }

      // --- Mini fanout distribute ---
      if (pid === MINI_FANOUT_PROGRAM_ID) {
        const idl = await fetchIdl(pid, connection);
        if (!idl) continue;

        const decoded = decodeInstruction(idl, ix.data);
        if (!decoded || decoded.name !== MINI_FANOUT_DISTRIBUTE_INSTRUCTION)
          continue;

        // Verify the mini fanout is attached to a hotspot via RecipientV0 lookup
        const miniFanoutAddress = resolveIxAccount(ix, 0, tx);
        if (!miniFanoutAddress) continue;
        if (!(await isHotspotMiniFanout(miniFanoutAddress, idl, connection)))
          continue;

        const directTransfers = wallet
          ? tokenTransfers.filter((t) => t.to === wallet)
          : tokenTransfers;
        let transfers: TokenTransfer[];
        if (directTransfers.length > 0 || !wallet) {
          transfers = directTransfers;
        } else {
          const balanceChanges = getWalletBalanceChanges(tx, wallet);
          if (!balanceChanges) return null;
          transfers = balanceChanges;
        }

        return {
          actionType: "rewards_distribution",
          actionMetadata: {
            program: "mini_fanout",
            instruction: decoded.name,
            transfers,
          },
        };
      }
    }
  }

  // 2. Try IDL-based decoding for any known program
  if (connection) {
    for (const ix of instructions) {
      const pid = getIxProgramId(ix, accountKeys);
      if (SKIP_PROGRAMS.has(pid) || !ix.data) continue;

      const idl = await fetchIdl(pid, connection);
      if (!idl) continue;

      const decoded = decodeInstruction(idl, ix.data);
      if (!decoded) continue;

      const programLabel = HELIUM_PROGRAMS[pid] || pid;
      const transfer = tokenTransfers[0];

      return {
        actionType: `${programLabel}.${decoded.name}`,
        actionMetadata: {
          program: programLabel,
          instruction: decoded.name,
          ...(transfer
            ? {
                mint: transfer.mint,
                amount: transfer.amount,
                tokenName: transfer.tokenName,
              }
            : {}),
        },
      };
    }

    // 3. Bubblegum transfer (Metaplex program, not in HELIUM_PROGRAMS)
    if (programIds.has(BUBBLEGUM_PROGRAM_ID)) {
      const idl = await fetchIdl(BUBBLEGUM_PROGRAM_ID, connection);
      if (idl) {
        for (const ix of instructions) {
          if (getIxProgramId(ix, accountKeys) !== BUBBLEGUM_PROGRAM_ID) continue;
          const decoded = decodeInstruction(idl, ix.data);
          if (decoded) {
            const ixAccounts = ix.accounts || [];
            return {
              actionType: `bubblegum.${decoded.name}`,
              actionMetadata: {
                program: "bubblegum",
                instruction: decoded.name,
                ...(decoded.name === "transfer"
                  ? {
                      from:
                        typeof ixAccounts[1] === "string"
                          ? ixAccounts[1]
                          : ixAccounts[1]?.toBase58?.() || "",
                      to:
                        typeof ixAccounts[3] === "string"
                          ? ixAccounts[3]
                          : ixAccounts[3]?.toBase58?.() || "",
                    }
                  : {}),
              },
            };
          }
        }
      }
    }
  }

  // 4. SPL Token Transfer from decoded transfer instructions
  if (tokenTransfers.length > 0) {
    const transfer = tokenTransfers[0];
    return {
      actionType: "spl_transfer",
      actionMetadata: {
        mint: transfer.mint,
        amount: transfer.amount,
        from: transfer.from,
        to: transfer.to,
        tokenName: transfer.tokenName,
      },
    };
  }

  // 5. Native SOL Transfer (only if sole top-level program is system)
  const meta = tx.meta;
  if (meta?.preBalances && meta?.postBalances) {
    const accountKeys = getAccountKeys(tx);
    const topLevelPrograms = new Set(
      instructions.map((ix: any) => getIxProgramId(ix, accountKeys)),
    );
    topLevelPrograms.delete("ComputeBudget111111111111111111111111111111");

    if (
      topLevelPrograms.size === 1 &&
      topLevelPrograms.has(SYSTEM_PROGRAM_ID)
    ) {
      const changes = meta.preBalances
        .map((pre, i) => ({
          account: accountKeys[i] || "",
          change: meta.postBalances[i] - pre,
        }))
        .filter(({ change }) => Math.abs(change) > 5000);
      const senders = changes.filter((c) => c.change < 0);
      const receivers = changes.filter((c) => c.change > 0);
      if (senders.length > 0 && receivers.length > 0) {
        return {
          actionType: "spl_transfer",
          actionMetadata: {
            mint: "So11111111111111111111111111111111111111112",
            amount: receivers[0].change,
            from: senders[0].account,
            to: receivers[0].account,
            tokenName: "SOL",
          },
        };
      }
    }
  }

  return null;
}
