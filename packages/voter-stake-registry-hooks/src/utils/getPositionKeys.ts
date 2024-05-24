import { AnchorProvider } from "@coral-xyz/anchor";
import { } from '@helium/nft-proxy-sdk';
import {
  VoteService,
  getPositionKeysForOwner,
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
  proxies: Proxy[];
}> => {
  const { mint, wallet, provider, voteService } = args;
  const me = wallet;

  const registrarPk = getRegistrarKey(mint);
  const program = await initVsr(provider as any);
  const registrar = (await program.account.registrar.fetch(
    registrarPk
  )) as Registrar;

  const myProxies = await voteService.getProxyAssignmentsForWallet(me, mint);
  const proxyPositions = myProxies.map(
    (del) => positionKey(new PublicKey(del.asset))[0]
  );

  let { positions: positionKeys } = await getPositionKeysForOwner({
    connection: provider.connection,
    owner: wallet,
    collection: registrar.collection,
  })

  return {
    positionKeys,
    proxiedPositionKeys: proxyPositions,
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

