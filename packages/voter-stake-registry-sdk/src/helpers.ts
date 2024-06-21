import { Asset, searchAssets, truthy } from "@helium/spl-utils";
import { AccountInfo, PublicKey, Connection } from "@solana/web3.js";
import { positionKey, registrarCollectionKey } from "./pdas";
import { TOKEN_PROGRAM_ID, unpackAccount } from "@solana/spl-token";
import {
  PROGRAM_ID as MPL_PID,
  Metadata,
} from "@metaplex-foundation/mpl-token-metadata";

export async function getPositionKeysForOwner({
  connection,
  owner,
  registrar,
}: {
  connection: Connection;
  owner: PublicKey;
  registrar: PublicKey;
}): Promise<{ positions: PublicKey[]; assets: PublicKey[] }> {
  let positions: PublicKey[] = [];
  let assets: PublicKey[] = [];
  const collection = registrarCollectionKey(registrar)[0];

  try {
    let page = 1;
    const limit = 1000;
    let allAssets: Asset[] = [];
    while (true) {
      const assets =
        (await searchAssets(connection.rpcEndpoint, {
          page,
          limit,
          ownerAddress: owner.toBase58(),
          tokenType: "fungible",
          collection: collection.toBase58(),
        })) || [];

      allAssets = allAssets.concat(assets);

      if (assets.length < limit) {
        break;
      }

      page++;
    }
    const filtered = allAssets.filter((asset) =>
      asset.grouping?.find(
        (group) =>
          group.group_key === "collection" &&
          group.group_value.equals(collection)
      )
    );
    positions = filtered.map((asset) => positionKey(asset.id)[0]);
    assets = filtered.map((f) => f.id);
  } catch (e) {
    // If DAS not supported
    console.error(e);
    const tokens = await connection.getTokenAccountsByOwner(owner, {
      programId: TOKEN_PROGRAM_ID,
    });
    const withMetas = tokens.value.map((t) => {
      const mint = unpackAccount(t.pubkey, t.account, TOKEN_PROGRAM_ID).mint;
      return {
        mint,
        metadata: PublicKey.findProgramAddressSync(
          [
            Buffer.from("metadata", "utf-8"),
            MPL_PID.toBuffer(),
            mint.toBuffer(),
          ],
          MPL_PID
        )[0],
      };
    });
    const metadatas = (
      await getMultipleAccounts({
        connection,
        keys: withMetas.map((w) => w.metadata),
      })
    ).map((i) => i.account && Metadata.fromAccountInfo(i.account)[0]);
    const filtered = metadatas
      .map((m, i) => ({
        ...withMetas[i],
        metadataAcc: m,
      }))
      .filter(
        (m) =>
          m &&
          m.metadataAcc?.collection?.key.equals(collection) &&
          m.metadataAcc?.collection?.verified
      )
      .filter(truthy);
    positions = filtered.map((m) => positionKey(m.mint)[0]);
    assets = filtered.map((f) => f.mint);
  }

  return {
    positions,
    assets,
  };
}

async function getMultipleAccounts({
  connection,
  keys,
}: {
  connection: Connection;
  keys: PublicKey[];
}): Promise<{ pubkey: PublicKey; account: AccountInfo<Buffer> | null }[]> {
  const batchSize = 100;
  const batches = Math.ceil(keys.length / batchSize);
  const results: { pubkey: PublicKey; account: AccountInfo<Buffer> | null }[] =
    [];

  for (let i = 0; i < batches; i++) {
    const batchKeys = keys.slice(i * batchSize, (i + 1) * batchSize);
    const batchResults = await connection.getMultipleAccountsInfo(batchKeys, {
      commitment: "confirmed",
    });
    results.push(
      ...batchResults.map((account, i) => ({ account, pubkey: batchKeys[i] }))
    );
  }

  return results;
}
