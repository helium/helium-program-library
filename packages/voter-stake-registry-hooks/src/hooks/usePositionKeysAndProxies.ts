import { AnchorProvider, BN } from "@coral-xyz/anchor";
import { VoteService, positionKey } from "@helium/voter-stake-registry-sdk";
import { PublicKey } from "@solana/web3.js";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { positionKeysForWalletQuery } from "../queries/positionKeysForWalletQuery";
import { proxyAssignmentsForWalletQuery } from "../queries/proxyAssignmentsForWalletQuery";

export interface GetPositionKeysAndProxiesArgs {
  wallet?: PublicKey;
  provider?: AnchorProvider;
  voteService?: VoteService;
}

export function usePositionKeysAndProxies({
  wallet,
  provider,
  voteService,
}: GetPositionKeysAndProxiesArgs) {
  const {
    data: myProxies,
    error: myProxyError,
    isLoading: myProxyLoading,
  } = useQuery(
    proxyAssignmentsForWalletQuery({
      wallet,
      voteService,
    })
  );
  const proxyPositions = useMemo(
    () => myProxies?.map((del) => positionKey(new PublicKey(del.asset))[0]),
    [myProxies]
  );
  const registrar = useMemo(
    () =>
      voteService ? new PublicKey(voteService?.config.registrar) : undefined,
    [voteService]
  );
  const {
    data: positionKeys,
    error,
    isLoading,
  } = useQuery(
    positionKeysForWalletQuery({
      wallet,
      registrar: registrar!,
      connection: provider?.connection,
    })
  );

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
      isExpired: d.isExpired,
    })),
  };
}
