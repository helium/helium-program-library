import { AnchorProvider } from "@coral-xyz/anchor";
import { Asset, searchAssets } from "@helium/spl-utils";
import {
  VoteService,
  getRegistrarKey,
  init as initVsr,
  positionKey,
} from "@helium/voter-stake-registry-sdk";
import { PublicKey } from "@solana/web3.js";
import { BN } from "bn.js";
import { Proxy, Registrar } from "../sdk/types";

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
  nfts: Asset[];
  proxies: Proxy[];
}> => {
  const { mint, wallet, provider, voteService } = args;
  const connection = provider.connection;

  const me = wallet;

  const registrarPk = getRegistrarKey(mint);
  const program = await initVsr(provider as any);
  const registrar = (await program.account.registrar.fetch(
    registrarPk
  )) as Registrar;

  const myProxies = await voteService.getProxiesForWallet(me);
  const delegationPositions = myProxies.map(
    (del) => positionKey(new PublicKey(del.asset))[0]
  );
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

  const positionKeys = allAssets
    .filter((asset) =>
      asset.grouping?.find(
        (group) =>
          group.group_key === "collection" &&
          group.group_value.equals(registrar.collection)
      )
    )
    .map((asset) => positionKey(asset.id)[0]);

  return {
    positionKeys,
    proxiedPositionKeys: delegationPositions,
    proxies: myProxies.map((d) => ({
      owner: new PublicKey(d.owner),
      nextOwner: new PublicKey(d.nextOwner),
      address: new PublicKey(d.address),
      asset: new PublicKey(d.asset),
      rentRefund: new PublicKey(d.rentRefund),
      proxyConfig: new PublicKey(d.proxyConfig),
      index: d.index,
      bumpSeed: d.bumpSeed,
      expirationTime: new BN(d.expirationTime)
    })),
    nfts: allAssets,
  };
};
