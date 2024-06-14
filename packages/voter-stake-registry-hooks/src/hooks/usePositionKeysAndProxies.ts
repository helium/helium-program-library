import { AnchorProvider, BN } from "@coral-xyz/anchor";
import {
  VoteService,
  getPositionKeysForOwner,
  getRegistrarKey,
  positionKey,
} from "@helium/voter-stake-registry-sdk";
import { PublicKey } from "@solana/web3.js";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useRegistrar } from "./useRegistrar";

export interface GetPositionKeysAndProxiesArgs {
  wallet?: PublicKey;
  mint?: PublicKey;
  provider?: AnchorProvider;
  voteService?: VoteService;
}

export function usePositionKeysAndProxies({
  wallet,
  mint,
  provider,
  voteService,
}: GetPositionKeysAndProxiesArgs) {
  const registrarKey = useMemo(
    () => mint && getRegistrarKey(mint),
    [mint?.toBase58()]
  );
  const { info: registrar } = useRegistrar(registrarKey);
  const {
    data: myProxies,
    error: myProxyError,
    isLoading: myProxyLoading,
  } = useQuery({
    queryKey: [
      "proxyAssignmentsForWallet",
      {
        registrar: voteService?.registrar.toBase58(),
        wallet: wallet?.toBase58(),
        mint: mint?.toBase58(),
      },
    ],
    queryFn: () => voteService!.getProxyAssignmentsForWallet(wallet!, mint!),
    enabled: !!wallet && !!mint && !!voteService,
  });
  const proxyPositions = useMemo(
    () => myProxies?.map((del) => positionKey(new PublicKey(del.asset))[0]),
    [myProxies]
  );
  const {
    data: positionKeys,
    error,
    isLoading,
  } = useQuery({
    queryKey: [
      "positionKeys",
      {
        wallet,
        collection: registrar?.collection,
        rpcEndpoint: provider?.connection.rpcEndpoint,
      },
    ],
    queryFn: () =>
      getPositionKeysForOwner({
        connection: provider!.connection,
        owner: wallet!,
        collection: registrar?.collection!,
      }),
    enabled: !!wallet && !!registrar?.collection && !!provider,
  });

  return {
    error: error || myProxyError,
    isLoading: isLoading || myProxyLoading,
    positionKeys: positionKeys?.positions,
    assetIds: positionKeys?.assets,
    proxiedPositionKeys: proxyPositions,
    proxies: myProxies?.map((d) => ({
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
}
