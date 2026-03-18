import {
  BorshInstructionCoder,
  Program,
  Idl,
} from "@coral-xyz/anchor";
import { convertIdlToCamelCase } from "@coral-xyz/anchor/dist/cjs/idl";
import { PublicKey, Connection } from "@solana/web3.js";
import { fetchBackwardsCompatibleIdl } from "@helium/spl-utils";
import { convertLegacyIdl } from "@helium/sus";
import type { HeliusTransaction } from "./helius";

export interface ClassifiedTransaction {
  actionType: string;
  actionMetadata: Record<string, unknown>;
}

const BUBBLEGUM_PROGRAM_ID =
  "BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY";
const LAZY_DISTRIBUTOR_PROGRAM_ID =
  "1azyuavdMyvsivtNxPoz6SucD18eDHeXzFCUPq5XU7w";
const MINI_FANOUT_PROGRAM_ID =
  "mfanLprNnaiP4RX9Zz1BMcDosYHCqnG24H1fMEbi9Gn";
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";

const KNOWN_TOKEN_NAMES: Record<string, string> = {
  hntyVP6YFm1Hg25TN9WGLqM12b8TQv3XP931pR9s263: "HNT",
  "11111111111111111111111111111111": "SOL",
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  iotEVVZLEywoTn1QdwNPddxPWszn3zFhEot3MfL9o2t: "IOT",
  mb1eu7TzEc71KxDpsmsKoucSSuuoGLv1drys1oP2jh6: "MOBILE",
  So11111111111111111111111111111111111111112: "SOL",
};

// Lazy-distributor instruction names that indicate a claim
const LD_CLAIM_INSTRUCTIONS = new Set([
  "distributeCompressionRewardsV0",
  "distributeCustomDestinationV0",
  "distributeRewardsV0",
]);

// Cache fetched IDLs
const idlCache = new Map<string, Idl | null>();

// Helium program IDs that fetchBackwardsCompatibleIdl knows about
const HELIUM_PROGRAM_IDS = new Set([
  LAZY_DISTRIBUTOR_PROGRAM_ID,
  MINI_FANOUT_PROGRAM_ID,
]);

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

    if (HELIUM_PROGRAM_IDS.has(programId)) {
      // Use spl-utils which has bundled fallback IDLs for Helium programs
      idl = (await fetchBackwardsCompatibleIdl(pubkey, provider)) as Idl | null;
    } else {
      // Fetch from chain, converting legacy IDL format if needed
      const idlRaw = await Program.fetchIdl(pubkey, provider);
      if (!idlRaw) {
        idlCache.set(programId, null);
        return null;
      }
      // Legacy IDLs lack .address — convert them to new format
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
 * Extract program IDs from the transaction's account keys and instructions.
 */
function getInvolvedProgramIds(tx: HeliusTransaction): Set<string> {
  const programIds = new Set<string>();
  const message = tx.transaction?.message;
  if (!message) return programIds;

  // From top-level instructions
  const instructions = (message as any).instructions;
  if (instructions) {
    for (const ix of instructions) {
      const pid =
        typeof ix.programId === "string"
          ? ix.programId
          : ix.programId?.toBase58?.();
      if (pid) programIds.add(pid);
    }
  }

  // From inner instructions (jsonParsed format has programId on inner ixs)
  if (tx.meta?.innerInstructions) {
    for (const inner of tx.meta.innerInstructions) {
      for (const ix of inner.instructions) {
        const ixAny = ix as any;
        const pid =
          typeof ixAny.programId === "string"
            ? ixAny.programId
            : ixAny.programId?.toBase58?.();
        if (pid) programIds.add(pid);
      }
    }
  }

  return programIds;
}

/**
 * Extract token balance changes from pre/postTokenBalances.
 */
function getTokenTransfers(tx: HeliusTransaction): Array<{
  mint: string;
  amount: number;
  from: string;
  to: string;
}> {
  const meta = tx.meta;
  if (!meta?.preTokenBalances || !meta?.postTokenBalances) return [];

  const accountKeys = getAccountKeys(tx);
  const transfers: Array<{
    mint: string;
    amount: number;
    from: string;
    to: string;
  }> = [];

  // Group by mint
  const mintChanges = new Map<
    string,
    Array<{ owner: string; change: number }>
  >();

  for (const post of meta.postTokenBalances) {
    const pre = meta.preTokenBalances.find(
      (p) =>
        p.accountIndex === post.accountIndex && p.mint === post.mint,
    );
    const preAmount = pre?.uiTokenAmount?.uiAmount ?? 0;
    const postAmount = post.uiTokenAmount?.uiAmount ?? 0;
    const change = postAmount - preAmount;
    if (change !== 0) {
      const owner = post.owner || accountKeys[post.accountIndex] || "";
      if (!mintChanges.has(post.mint)) {
        mintChanges.set(post.mint, []);
      }
      mintChanges.get(post.mint)!.push({ owner, change });
    }
  }

  for (const [mint, changes] of mintChanges) {
    const senders = changes.filter((c) => c.change < 0);
    const receivers = changes.filter((c) => c.change > 0);
    if (senders.length > 0 && receivers.length > 0) {
      transfers.push({
        mint,
        amount: Math.abs(receivers[0].change),
        from: senders[0].owner,
        to: receivers[0].owner,
      });
    }
  }

  return transfers;
}

/**
 * Extract native SOL transfer from pre/postBalances.
 */
function getNativeTransfer(
  tx: HeliusTransaction,
): { from: string; to: string; amount: number } | null {
  const meta = tx.meta;
  if (!meta?.preBalances || !meta?.postBalances) return null;

  const accountKeys = getAccountKeys(tx);
  const changes: Array<{ account: string; change: number }> = [];

  for (let i = 0; i < meta.preBalances.length; i++) {
    const change = meta.postBalances[i] - meta.preBalances[i];
    // Ignore fee payer's fee deduction and tiny changes
    if (Math.abs(change) > 5000) {
      changes.push({ account: accountKeys[i] || "", change });
    }
  }

  const senders = changes.filter((c) => c.change < 0);
  const receivers = changes.filter((c) => c.change > 0);
  if (senders.length > 0 && receivers.length > 0) {
    return {
      from: senders[0].account,
      to: receivers[0].account,
      amount: receivers[0].change,
    };
  }
  return null;
}

function getAccountKeys(tx: HeliusTransaction): string[] {
  const message = tx.transaction?.message as any;
  if (!message) return [];

  // jsonParsed format: accountKeys is array of { pubkey, signer, writable, source }
  if (message.accountKeys?.[0]?.pubkey) {
    return message.accountKeys.map((k: any) =>
      typeof k.pubkey === "string" ? k.pubkey : k.pubkey?.toBase58?.() || "",
    );
  }
  // Fallback: array of strings
  if (typeof message.accountKeys?.[0] === "string") {
    return message.accountKeys;
  }
  return [];
}

/**
 * Classify a raw Solana transaction using IDL-based instruction decoding.
 */
export async function classifyTransaction(
  tx: HeliusTransaction,
  connection?: Connection,
): Promise<ClassifiedTransaction | null> {
  const programIds = getInvolvedProgramIds(tx);

  // 1. Bubblegum Transfer — check for bubblegum program in involved programs
  if (programIds.has(BUBBLEGUM_PROGRAM_ID)) {
    const idl = connection ? await fetchIdl(BUBBLEGUM_PROGRAM_ID, connection) : null;
    if (idl) {
      const instructions = (tx.transaction?.message as any)?.instructions || [];
      for (const ix of instructions) {
        const pid =
          typeof ix.programId === "string"
            ? ix.programId
            : ix.programId?.toBase58?.();
        if (pid !== BUBBLEGUM_PROGRAM_ID) continue;
        const decoded = decodeInstruction(idl, ix.data);
        if (decoded && decoded.name === "transfer") {
          const accountKeys = getAccountKeys(tx);
          const ixAccounts = ix.accounts || [];
          // Bubblegum transfer accounts: [treeAuthority, leafOwner, leafDelegate, newLeafOwner, ...]
          const leafOwner =
            typeof ixAccounts[1] === "string"
              ? ixAccounts[1]
              : ixAccounts[1]?.toBase58?.() || "";
          const newLeafOwner =
            typeof ixAccounts[3] === "string"
              ? ixAccounts[3]
              : ixAccounts[3]?.toBase58?.() || "";
          return {
            actionType: "bubblegum_transfer",
            actionMetadata: {
              from: leafOwner,
              to: newLeafOwner,
            },
          };
        }
      }
    }
  }

  // 2. Lazy Distributor Claim
  if (programIds.has(LAZY_DISTRIBUTOR_PROGRAM_ID)) {
    const idl = connection ? await fetchIdl(LAZY_DISTRIBUTOR_PROGRAM_ID, connection) : null;
    if (idl) {
      const instructions = (tx.transaction?.message as any)?.instructions || [];
      for (const ix of instructions) {
        const pid =
          typeof ix.programId === "string"
            ? ix.programId
            : ix.programId?.toBase58?.();
        if (pid !== LAZY_DISTRIBUTOR_PROGRAM_ID) continue;
        const decoded = decodeInstruction(idl, ix.data);
        if (decoded && LD_CLAIM_INSTRUCTIONS.has(decoded.name)) {
          const tokenTransfers = getTokenTransfers(tx);
          const transfer = tokenTransfers[0];
          return {
            actionType: "lazy_distributor_claim",
            actionMetadata: {
              instructionName: decoded.name,
              mint: transfer?.mint,
              amount: transfer?.amount,
              tokenName: transfer?.mint
                ? KNOWN_TOKEN_NAMES[transfer.mint]
                : undefined,
            },
          };
        }
      }
    }
  }

  // 3. Mini Fanout Distribution
  if (programIds.has(MINI_FANOUT_PROGRAM_ID)) {
    const idl = connection ? await fetchIdl(MINI_FANOUT_PROGRAM_ID, connection) : null;
    if (idl) {
      const instructions = (tx.transaction?.message as any)?.instructions || [];
      for (const ix of instructions) {
        const pid =
          typeof ix.programId === "string"
            ? ix.programId
            : ix.programId?.toBase58?.();
        if (pid !== MINI_FANOUT_PROGRAM_ID) continue;
        const decoded = decodeInstruction(idl, ix.data);
        if (decoded) {
          const tokenTransfers = getTokenTransfers(tx);
          const transfer = tokenTransfers[0];
          return {
            actionType: "mini_fanout_claim",
            actionMetadata: {
              instructionName: decoded.name,
              mint: transfer?.mint,
              amount: transfer?.amount,
              tokenName: transfer?.mint
                ? KNOWN_TOKEN_NAMES[transfer.mint]
                : undefined,
            },
          };
        }
      }
    }
  }

  // 4. SPL Token Transfer (no Helium-specific program involved)
  const tokenTransfers = getTokenTransfers(tx);
  if (tokenTransfers.length > 0) {
    const transfer = tokenTransfers[0];
    return {
      actionType: "spl_transfer",
      actionMetadata: {
        mint: transfer.mint,
        amount: transfer.amount,
        from: transfer.from,
        to: transfer.to,
        tokenName: KNOWN_TOKEN_NAMES[transfer.mint],
      },
    };
  }

  // 5. Native SOL Transfer
  const nativeTransfer = getNativeTransfer(tx);
  if (nativeTransfer) {
    // Only classify as SOL transfer if the only top-level program is system program
    const topLevelPrograms = new Set<string>();
    const instructions = (tx.transaction?.message as any)?.instructions || [];
    for (const ix of instructions) {
      const pid =
        typeof ix.programId === "string"
          ? ix.programId
          : ix.programId?.toBase58?.();
      if (pid) topLevelPrograms.add(pid);
    }
    if (
      topLevelPrograms.size === 1 &&
      topLevelPrograms.has(SYSTEM_PROGRAM_ID)
    ) {
      return {
        actionType: "spl_transfer",
        actionMetadata: {
          mint: "So11111111111111111111111111111111111111112",
          amount: nativeTransfer.amount,
          from: nativeTransfer.from,
          to: nativeTransfer.to,
          tokenName: "SOL",
        },
      };
    }
  }

  // Unknown — skip
  return null;
}
