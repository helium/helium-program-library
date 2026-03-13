import fs from "fs";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync, getMint } from "@solana/spl-token";
import { getSurfpoolRpcUrl } from "./surfpool";

export function loadKeypairFromPath(pathEnv: string): Keypair {
  if (pathEnv && fs.existsSync(pathEnv)) {
    const content = fs.readFileSync(pathEnv, "utf8");
    const arr = JSON.parse(content);
    if (Array.isArray(arr)) return Keypair.fromSecretKey(new Uint8Array(arr));
    throw new Error("Keypair file must contain a JSON array secret key");
  }
  const raw = process.env.TEST_WALLET_PRIVATE_KEY;
  if (raw) {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return Keypair.fromSecretKey(new Uint8Array(arr));
    throw new Error("TEST_WALLET_PRIVATE_KEY must be a JSON array of numbers");
  }
  return Keypair.generate();
}

export function loadKeypairFromEnv(): Keypair {
  const pathEnv = process.env.TEST_WALLET_KEYPAIR_PATH;
  if (!pathEnv) {
    throw new Error("TEST_WALLET_KEYPAIR_PATH is not set");
  }
  return loadKeypairFromPath(pathEnv);
}

export function loadKeypair2FromEnv(): Keypair {
  const pathEnv = process.env.TEST_WALLET_2_KEYPAIR_PATH;
  if (!pathEnv) {
    throw new Error("TEST_WALLET_2_KEYPAIR_PATH is not set");
  }
  return loadKeypairFromPath(pathEnv);
}

export async function ensureFunds(
  pubkey: PublicKey,
  minLamports: number,
  rpcUrl = getSurfpoolRpcUrl()
): Promise<void> {
  const connection = new Connection(rpcUrl, "confirmed");
  const current = await connection.getBalance(pubkey);
  if (current >= minLamports) return;
  const needed = Math.max(minLamports - current, 0.1 * LAMPORTS_PER_SOL);
  try {
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("confirmed");
    const sig = await connection.requestAirdrop(pubkey, Math.ceil(needed));
    await connection.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      "confirmed"
    );
    return;
  } catch {}
  try {
    await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "surfnet_setBalance",
        params: [pubkey.toBase58(), Math.ceil(minLamports)],
      }),
    });
  } catch {}
}

export async function ensureTokenBalance(
  owner: PublicKey,
  mint: PublicKey,
  amount: number,
  rpcUrl = getSurfpoolRpcUrl()
): Promise<PublicKey> {
  const connection = new Connection(rpcUrl, "confirmed");
  const ata = getAssociatedTokenAddressSync(mint, owner, true);

  try {
    const mintInfo = await getMint(connection, mint);
    const decimals = mintInfo.decimals;
    const rawAmount = Math.ceil(amount * Math.pow(10, decimals));

    console.log(
      `Setting ${amount} tokens (${rawAmount} raw with ${decimals} decimals)`
    );

    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "surfnet_setTokenAccount",
        params: [
          owner.toBase58(),
          mint.toBase58(),
          { amount: rawAmount },
          "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        ],
      }),
    });

    const result = await response.json();
    if (result.error) {
      console.error("surfnet_setTokenAccount error:", result.error);
    } else {
      console.log(
        `Set token balance for ${owner.toBase58()} (${ata.toBase58()}) to ${amount} tokens`
      );
    }
  } catch (e) {
    console.warn("Failed to set token balance:", e);
  }

  return ata;
}
