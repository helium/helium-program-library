import { AnchorProvider } from "@coral-xyz/anchor";
import { Asset, searchAssets, truthy } from "@helium/spl-utils";
import { unpackAccount } from "@solana/spl-token";
import {
  VoteService,
  getRegistrarKey,
  init as initVsr,
  positionKey,
} from "@helium/voter-stake-registry-sdk";
import { AccountInfo, Connection, PublicKey } from "@solana/web3.js";
import { BN } from "bn.js";
import { Proxy, Registrar } from "../sdk/types";
import { TOKEN_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/utils/token";
import {
  PROGRAM_ID as MPL_PID,
  Metadata,
} from "@metaplex-foundation/mpl-token-metadata";

export interface GetPositionsArgs {
  wallet: PublicKey;
  mint: PublicKey;
  provider: AnchorProvider;
  voteService: VoteService;
}

export const getPositionKeys = async (
  args: GetPositionsArgs
): Promise<{
  proxiedPositionKeys: PublicKey[];
  positionKeys: PublicKey[];
  proxies: Proxy[];
}> => {
  const { mint, wallet, provider, voteService } = args;
  const me = wallet;

  const registrarPk = getRegistrarKey(mint);
  const program = await initVsr(provider as any);
  const registrar = (await program.account.registrar.fetch(
    registrarPk
  )) as Registrar;

  const myProxies = await voteService.getProxyAssignmentsForWallet(me);
  const delegationPositions = myProxies.map(
    (del) => positionKey(new PublicKey(del.asset))[0]
  );

  let positionKeys: PublicKey[] = [];
  try {
    let page = 1;
    const limit = 1000;
    let allAssets: Asset[] = [];
    while (true) {
      const assets =
        (await searchAssets(provider.connection.rpcEndpoint, {
          page,
          limit,
          ownerAddress: wallet.toBase58(),
          tokenType: "fungible",
          collection: registrar.collection.toBase58(),
        })) || [];

      allAssets = allAssets.concat(assets);

      if (assets.length < limit) {
        break;
      }

      page++;
    }
    positionKeys = allAssets
      .filter((asset) =>
        asset.grouping?.find(
          (group) =>
            group.group_key === "collection" &&
            group.group_value.equals(registrar.collection)
        )
      )
      .map((asset) => positionKey(asset.id)[0]);
  } catch (e) {
    // If DAS not supported
    console.error(e);
    const tokens = await provider.connection.getTokenAccountsByOwner(wallet, {
      programId: TOKEN_PROGRAM_ID,
    });
    const metadatas = (
      await getMultipleAccounts({
        connection: provider.connection,
        keys: tokens.value.map(
          (t) =>
            PublicKey.findProgramAddressSync(
              [
                Buffer.from("metadata", "utf-8"),
                MPL_PID.toBuffer(),
                unpackAccount(
                  t.pubkey,
                  t.account,
                  TOKEN_PROGRAM_ID
                ).mint.toBuffer(),
              ],
              MPL_PID
            )[0]
        ),
      })
    ).map((i) => i.account && Metadata.fromAccountInfo(i.account)[0]);
    positionKeys = metadatas
      .filter(
        (m) =>
          m &&
          m.collection?.key.equals(registrar.collection) &&
          m.collection?.verified
      )
      .filter(truthy)
      .map((m) => positionKey(m.mint)[0]);
  }

  return {
    positionKeys,
    proxiedPositionKeys: delegationPositions,
    proxies: myProxies.map((d) => ({
      voter: new PublicKey(d.voter),
      nextVoter: new PublicKey(d.nextVoter),
      address: new PublicKey(d.address),
      asset: new PublicKey(d.asset),
      rentRefund: new PublicKey(d.rentRefund),
      proxyConfig: new PublicKey(d.proxyConfig),
      index: d.index,
      bumpSeed: d.bumpSeed,
      expirationTime: new BN(d.expirationTime),
    })),
  };
};

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
