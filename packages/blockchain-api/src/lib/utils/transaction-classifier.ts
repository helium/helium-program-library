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
const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";

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
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
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
      idl = (await fetchBackwardsCompatibleIdl(pubkey, provider)) as Idl | null;
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

function getIxProgramId(ix: any): string {
  return typeof ix.programId === "string"
    ? ix.programId
    : ix.programId?.toBase58?.() || "";
}

function getAccountKeys(tx: HeliusTransaction): string[] {
  const message = tx.transaction?.message as any;
  if (!message) return [];
  if (message.accountKeys?.[0]?.pubkey) {
    return message.accountKeys.map((k: any) =>
      typeof k.pubkey === "string" ? k.pubkey : k.pubkey?.toBase58?.() || "",
    );
  }
  if (typeof message.accountKeys?.[0] === "string") {
    return message.accountKeys;
  }
  return [];
}

function getInvolvedProgramIds(tx: HeliusTransaction): Set<string> {
  const instructions = (tx.transaction?.message as any)?.instructions || [];
  const allIxs = [
    ...instructions,
    ...(tx.meta?.innerInstructions ?? []).flatMap(
      (inner) => inner.instructions,
    ),
  ];
  return new Set(allIxs.map(getIxProgramId).filter(Boolean));
}

function getTokenTransfers(tx: HeliusTransaction): Array<{
  mint: string;
  amount: number;
  from: string;
  to: string;
}> {
  const meta = tx.meta;
  if (!meta?.preTokenBalances || !meta?.postTokenBalances) return [];

  const { preTokenBalances, postTokenBalances } = meta;
  const mintChanges = postTokenBalances.reduce(
    (acc, post) => {
      const pre = preTokenBalances.find(
        (p) => p.accountIndex === post.accountIndex && p.mint === post.mint,
      );
      const change =
        (post.uiTokenAmount?.uiAmount ?? 0) -
        (pre?.uiTokenAmount?.uiAmount ?? 0);
      if (change !== 0) {
        const existing = acc.get(post.mint) ?? [];
        acc.set(post.mint, [...existing, { owner: post.owner || "", change }]);
      }
      return acc;
    },
    new Map<string, Array<{ owner: string; change: number }>>(),
  );

  return Array.from(mintChanges.entries()).flatMap(([mint, changes]) => {
    const senders = changes.filter((c) => c.change < 0);
    const receivers = changes.filter((c) => c.change > 0);
    return senders.length > 0 && receivers.length > 0
      ? [
          {
            mint,
            amount: Math.abs(receivers[0].change),
            from: senders[0].owner,
            to: receivers[0].owner,
          },
        ]
      : [];
  });
}

/**
 * Classify a raw Solana transaction using IDL-based instruction decoding.
 *
 * Priority:
 * 1. Decode the primary (non-infra) program instruction via IDL → use program name + instruction name
 * 2. Bubblegum transfer (special case since it's Metaplex, not Helium)
 * 3. SPL token transfer from balance changes
 * 4. Native SOL transfer
 */
export async function classifyTransaction(
  tx: HeliusTransaction,
  connection?: Connection,
): Promise<ClassifiedTransaction | null> {
  const instructions = (tx.transaction?.message as any)?.instructions || [];
  const programIds = getInvolvedProgramIds(tx);
  const tokenTransfers = getTokenTransfers(tx);

  // 1. Try IDL-based decoding for any known program
  if (connection) {
    for (const ix of instructions) {
      const pid = getIxProgramId(ix);
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
                tokenName: KNOWN_TOKEN_NAMES[transfer.mint],
              }
            : {}),
        },
      };
    }

    // 2. Bubblegum transfer (Metaplex program, not in HELIUM_PROGRAMS)
    if (programIds.has(BUBBLEGUM_PROGRAM_ID)) {
      const idl = await fetchIdl(BUBBLEGUM_PROGRAM_ID, connection);
      if (idl) {
        for (const ix of instructions) {
          if (getIxProgramId(ix) !== BUBBLEGUM_PROGRAM_ID) continue;
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

  // 3. SPL Token Transfer from balance changes
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

  // 4. Native SOL Transfer (only if sole top-level program is system)
  const meta = tx.meta;
  if (meta?.preBalances && meta?.postBalances) {
    const accountKeys = getAccountKeys(tx);
    const topLevelPrograms = new Set(instructions.map(getIxProgramId));
    // Remove compute budget — it's always there
    topLevelPrograms.delete("ComputeBudget111111111111111111111111111111");

    if (topLevelPrograms.size === 1 && topLevelPrograms.has(SYSTEM_PROGRAM_ID)) {
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
