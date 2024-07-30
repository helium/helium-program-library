import { Connection, PublicKey, Cluster } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";
import {
  PythSolanaReceiver,
  IDL as pythSolanaReceiverIdl,
} from "./pyth";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";

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
  const pythProgram: Program<PythSolanaReceiver> = new Program(
    pythSolanaReceiverIdl,
    new PublicKey("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ"),
    new AnchorProvider(connection, {} as Wallet, {
      skipPreflight: true,
    })
  );

  const data = await pythProgram.account.priceUpdateV2.fetch(
    new PublicKey("4DdmDswskDxXGpwHrXUfn2CNUm9rt21ac79GHNTN3J33")
  );

  return data;
};
