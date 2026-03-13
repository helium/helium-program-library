import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import { env } from "./env";
import fs from "fs";

export interface SolanaConnection {
  connection: Connection;
  provider: AnchorProvider;
  wallet: {
    publicKey: PublicKey;
    signTransaction: () => Promise<never>;
    signAllTransactions: () => Promise<never>;
  };
}

export function getCluster(): string {
  return process.env.NEXT_PUBLIC_SOLANA_CLUSTER || "mainnet";
}

export function loadKeypair(keypair: string): Keypair {
  return Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(keypair).toString())),
  );
}

let cachedConnection: Connection | undefined;

function getConnection(): Connection {
  if (!cachedConnection) {
    cachedConnection = new Connection(env.SOLANA_RPC_URL);
  }
  return cachedConnection;
}

export function createSolanaConnection(
  walletAddress: string,
): SolanaConnection {
  const connection = getConnection();
  const wallet = {
    publicKey: new PublicKey(walletAddress),
    signTransaction: async () => {
      throw new Error("Wallet cannot sign transactions");
    },
    signAllTransactions: async () => {
      throw new Error("Wallet cannot sign transactions");
    },
  };
  const provider = new AnchorProvider(
    connection,
    wallet,
    AnchorProvider.defaultOptions(),
  );

  return {
    connection,
    provider,
    wallet,
  };
}
