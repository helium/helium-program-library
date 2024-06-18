import { Connection, PublicKey, Cluster } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";
import {
  PythSolanaReceiverProgram,
  pythSolanaReceiverIdl,
} from "@pythnetwork/pyth-solana-receiver";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { token } from "@coral-xyz/anchor/dist/cjs/utils";

export const getBalance = async ({
  pubKey,
  mint,
  connection,
}: {
  connection: Connection;
  pubKey: PublicKey;
  mint: PublicKey;
}) => {
  try {
    const address = getAssociatedTokenAddressSync(mint, pubKey, true);
    const acct = await getAccount(connection, address);

    return acct.amount;
  } catch {
    return BigInt(0);
  }
};

export const getOraclePrice = async ({
  tokenType,
  cluster,
  connection,
}: {
  tokenType: "HNT";
  cluster: Cluster;
  connection: Connection;
}) => {
  const pythProgram: Program<PythSolanaReceiverProgram> = new Program(
    pythSolanaReceiverIdl,
    new PublicKey("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ"),
    new AnchorProvider(connection, {} as Wallet, {
      skipPreflight: true,
    })
  );

  const data = await pythProgram.account.priceUpdateV2.fetch(
    new PublicKey("DQ4C1tzvu28cwo1roN1Wm6TW35sfJEjLh517k3ZeWevx")
  );

  return data;
};
