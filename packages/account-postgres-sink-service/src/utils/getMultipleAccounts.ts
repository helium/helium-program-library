import { AccountInfo, Connection, PublicKey } from "@solana/web3.js";

export const getMultipleAccounts = async ({
  connection,
  keys,
  minContextSlot,
}: {
  connection: Connection;
  keys: PublicKey[];
  minContextSlot?: number;
}): Promise<{ pubkey: PublicKey; account: AccountInfo<Buffer> | null }[]> => {
  const batchSize = 100;
  const batches = Math.ceil(keys.length / batchSize);
  const results: { pubkey: PublicKey; account: AccountInfo<Buffer> | null }[] =
    [];

  for (let i = 0; i < batches; i++) {
    const batchKeys = keys.slice(i * batchSize, (i + 1) * batchSize);
    const batchResults = await connection.getMultipleAccountsInfo(batchKeys, {
      minContextSlot,
      commitment: "confirmed",
    });
    results.push(
      ...batchResults.map((account, i) => ({ account, pubkey: batchKeys[i] }))
    );
  }

  return results;
};
