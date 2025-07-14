import { AnchorProvider, BN, IdlAccounts, Wallet } from "@coral-xyz/anchor";
import { useSolanaUnixNow } from "@helium/helium-react-hooks";
import {
  EPOCH_LENGTH,
  delegatedPositionKey,
  getLockupEffectiveEndTs,
} from "@helium/helium-sub-daos-sdk";
import { VoterStakeRegistry } from "@helium/idls/lib/types/voter_stake_registry";
import { init as initNftProxy, proxyConfigKey } from "@helium/nft-proxy-sdk";
import { truthy } from "@helium/spl-utils";
import { VoteService, init } from "@helium/voter-stake-registry-sdk";
import { Connection, PublicKey } from "@solana/web3.js";
import React, { createContext, useContext, useMemo } from "react";
import { useAsync } from "react-async-hook";
import { useDelegatedPositions } from "../hooks/useDelegatedPositions";
import { usePositionKeysAndProxies } from "../hooks/usePositionKeysAndProxies";
import { usePositions } from "../hooks/usePositions";
import { useRegistrar } from "../hooks/useRegistrar";
import { PositionWithMeta, ProxyAssignmentV0 } from "../sdk/types";
import { calcPositionVotingPower } from "../utils/calcPositionVotingPower";
import { useRegistrarForMint } from "../hooks/useRegistrarForMint";
import { useProxyConfig } from "../hooks/useProxyConfig";

type Registrar = IdlAccounts<VoterStakeRegistry>["registrar"];

export interface HeliumVsrState {
  amountLocked?: BN;
  amountProxyLocked?: BN;
  loading: boolean;
  mint?: PublicKey;
  positions?: PositionWithMeta[];
  provider?: AnchorProvider;
  votingPower?: BN;
  myVotingPower?: BN;
  proxiedVotingPower?: BN;
  registrar?: Registrar & { pubkey?: PublicKey };
  unixNow?: number;

  refetch: () => void;
  voteService?: VoteService;
}

const defaultState: HeliumVsrState = {
  amountLocked: new BN(0),
  loading: false,
  mint: undefined,
  positions: [],
  provider: undefined,
  votingPower: new BN(0),
  myVotingPower: new BN(0),
  proxiedVotingPower: new BN(0),
  voteService: undefined,
  registrar: undefined,

  refetch: () => {},
};

const HeliumVsrStateContext = createContext<HeliumVsrState>(defaultState);

export const useHeliumVsrState: () => HeliumVsrState = () => {
  const context = useContext(HeliumVsrStateContext);
  if (context === undefined) {
    throw new Error(
      "useHeliumVsrState must be used within a HeliumVsrStateProvider"
    );
  }
  return context;
};

export const HeliumVsrStateProvider: React.FC<{
  connection: Connection | undefined;
  wallet: Wallet | undefined;
  mint: PublicKey | undefined;
  children: React.ReactNode;
  heliumVoteUri?: string;
}> = ({ heliumVoteUri, wallet, mint, connection, children }) => {
  const me = useMemo(() => wallet?.publicKey, [wallet?.publicKey?.toBase58()]);
  const now = useSolanaUnixNow(60 * 5 * 1000);

  const provider = useMemo(() => {
    if (connection && wallet) {
      return new AnchorProvider(connection, wallet, {
        preflightCommitment: "confirmed",
        commitment: "confirmed",
        skipPreflight: true,
      });
    }
  }, [connection?.rpcEndpoint, wallet?.publicKey?.toBase58()]);

  const { registrarKey } = useRegistrarForMint(mint);

  const { info: registrar } = useRegistrar(registrarKey);

  const urlVoteService = useMemo(() => {
    return heliumVoteUri && registrarKey
      ? new VoteService({
          baseURL: heliumVoteUri,
          registrar: registrarKey,
        })
      : undefined;
  }, [heliumVoteUri, registrarKey]);

  // Allow vote service either from native rpc or from api
  const { result: programVoteService } = useAsync(async () => {
    if (registrarKey) {
      if (!urlVoteService) {
        const program = await init(provider as any);
        const nftProxyProgram = await initNftProxy(provider as any);
        return new VoteService({
          registrar: registrarKey,
          program,
          nftProxyProgram,
        });
      }
    }
  }, [provider, registrarKey, urlVoteService]);

  const voteService = useMemo(
    () => urlVoteService ?? programVoteService,
    [urlVoteService, programVoteService]
  );

  const {
    positionKeys,
    proxiedPositionKeys,
    proxies: proxyAccounts,
    isLoading,
    error,
    refetch,
  } = usePositionKeysAndProxies({
    wallet: me,
    provider,
    voteService,
  });

  const delegatedPositionKeys = useMemo(() => {
    return positionKeys?.map((pk) => delegatedPositionKey(pk)[0]);
  }, [positionKeys]);

  const { accounts: delegatedAccounts, loading: loadingDel } =
    useDelegatedPositions(delegatedPositionKeys);

  const { info: proxyConfig } = useProxyConfig(registrar?.proxyConfig);

  const proxyAccountsByAsset = useMemo(() => {
    return proxyAccounts?.reduce((acc, prox) => {
      acc[prox.asset.toBase58()] = prox;
      return acc;
    }, {} as Record<string, ProxyAssignmentV0>);
  }, [proxyAccounts]);

  const myOwnedPositionsEndIdx = positionKeys?.length;

  // Assume that my positions are a small amount, so we don't need to say they're static
  const { accounts: myPositions, loading: loadingMyPositions } =
    usePositions(positionKeys);

  // Proxied positions may be a lot, set to static
  const { accounts: proxiedPositions, loading: loadingDelPositions } =
    usePositions(proxiedPositionKeys, true);

  const positions = useMemo(() => {
    const uniquePositions = new Map();
    [...(myPositions || []), ...(proxiedPositions || [])].forEach(
      (position) => {
        if (position) {
          uniquePositions.set(position.publicKey.toBase58(), position);
        }
      }
    );
    return Array.from(uniquePositions.values());
  }, [myPositions, proxiedPositions]);

  const {
    amountLocked,
    votingPower,
    myVotingPower,
    proxiedVotingPower,
    positionsWithMeta,
    amountProxyLocked,
  } = useMemo(() => {
    if (positions && registrar && delegatedAccounts && now) {
      let amountLocked = new BN(0);
      let amountProxyLocked = new BN(0);
      let votingPower = new BN(0);
      let myVotingPower = new BN(0);
      let proxiedVotingPower = new BN(0);
      const mintCfgs = registrar?.votingMints;
      const positionsWithMeta = positions
        .map((position, idx) => {
          if (position && position.info) {
            const { lockup } = position.info;
            const lockupKind = Object.keys(lockup.kind)[0] as string;
            const isConstant = lockupKind === "constant";
            const isDecayed = !isConstant && lockup.endTs.lte(new BN(now));
            const decayedEpoch = lockup.endTs.div(new BN(EPOCH_LENGTH));
            const currentEpoch = new BN(now).div(new BN(EPOCH_LENGTH));
            const isDelegated = !!delegatedAccounts?.[idx]?.info;
            const proxy = proxyAccountsByAsset?.[position.info.mint.toBase58()];

            let hasRewards = false;
            const delegatedSubDao = isDelegated
              ? delegatedAccounts[idx]?.info?.subDao
              : null;

            if (isDelegated) {
              const epoch = delegatedAccounts[idx]!.info!.lastClaimedEpoch.add(
                new BN(1)
              );

              const epochsCount = isDecayed
                ? decayedEpoch.sub(epoch).add(new BN(1)).toNumber()
                : currentEpoch.sub(epoch).toNumber();

              hasRewards =
                epochsCount > 0 &&
                !(isDecayed && decayedEpoch.eq(currentEpoch));
            }

            const posVotingPower = calcPositionVotingPower({
              position: position?.info || null,
              registrar,
              unixNow: new BN(now),
            });

            const isProxiedToMe = idx >= (myOwnedPositionsEndIdx || 0);
            if (isProxiedToMe) {
              amountProxyLocked = amountProxyLocked.add(
                position.info.amountDepositedNative
              );

              proxiedVotingPower = proxiedVotingPower.add(posVotingPower);
            } else {
              amountLocked = amountLocked.add(
                position.info.amountDepositedNative
              );

              myVotingPower = myVotingPower.add(posVotingPower);
            }

            votingPower = votingPower.add(posVotingPower);

            const proxyExpiration = proxy?.expirationTime;
            const delegatedAcc = delegatedAccounts?.[idx]?.info;
            const delegationExpiration = delegatedAcc?.expirationTs;
            const isProxyExpired =
              !proxy?.nextVoter?.equals(PublicKey.default) &&
              proxyExpiration?.lt(new BN(now));
            const isDelegationExpired = delegationExpiration?.lt(new BN(now));
            const currentSeason = [...(proxyConfig?.seasons || [])]
              ?.reverse()
              ?.find((season) => season.start.lte(new BN(now)));

            const isProxyRenewable =
              proxyExpiration &&
              !isProxyExpired &&
              // Add one day of wiggle room, as proxies assign by number of days in UI.
              currentSeason?.end?.sub(new BN(EPOCH_LENGTH)).gt(proxyExpiration);
            const isDelegationRenewable =
              delegationExpiration &&
              !isDelegationExpired &&
              currentSeason?.end.gt(delegationExpiration) &&
              // The delegation might expire before the season end if the position expires before the season end.
              !getLockupEffectiveEndTs(position.info.lockup).eq(
                delegationExpiration
              );

            return {
              ...position.info,
              pubkey: position?.publicKey,
              isDelegated,
              delegatedSubDao,
              hasRewards,
              hasGenesisMultiplier: position.info.genesisEnd.gt(new BN(now)),
              votingPower: posVotingPower,
              votingMint: mintCfgs[position.info.votingMintConfigIdx],
              isProxiedToMe,
              proxy,
              isProxyExpired,
              isDelegationExpired,
              isProxyRenewable,
              isDelegationRenewable,
            } as PositionWithMeta;
          }
        })
        .filter(truthy);

      return {
        positionsWithMeta,
        amountLocked,
        amountProxyLocked,
        votingPower,
        myVotingPower,
        proxiedVotingPower,
        proxyAccountsByAsset,
        delegatedAccounts,
      };
    }

    return {};
  }, [
    myOwnedPositionsEndIdx,
    positions,
    registrar,
    delegatedAccounts,
    proxyAccounts,
    proxyAccountsByAsset,
  ]);

  const sortedPositions = useMemo(
    () =>
      positionsWithMeta?.sort((a, b) => {
        if (a.hasGenesisMultiplier || b.hasGenesisMultiplier) {
          if (b.hasGenesisMultiplier) {
            return a.amountDepositedNative.gt(b.amountDepositedNative) ? 0 : -1;
          }
          return -1;
        }

        return a.amountDepositedNative.gt(b.amountDepositedNative) ? -1 : 0;
      }),
    [positionsWithMeta]
  );
  const loadingPositions = loadingMyPositions || loadingDelPositions;
  const ret = useMemo(
    () => ({
      loading: isLoading || loadingPositions || loadingDel,
      error,
      amountLocked,
      amountProxyLocked,
      mint,
      positions: sortedPositions,
      provider,
      refetch,
      votingPower,
      myVotingPower,
      proxiedVotingPower,
      registrar: registrar
        ? {
            ...registrar,
            pubkey: registrarKey,
          }
        : undefined,
      voteService,
      unixNow: now,
    }),
    [
      loadingPositions,
      loadingDel,
      isLoading,
      error,
      amountLocked,
      amountProxyLocked,
      mint,
      sortedPositions,
      provider,
      refetch,
      votingPower,
      myVotingPower,
      proxiedVotingPower,
      registrar,
      voteService,
      now,
    ]
  );
  return (
    <HeliumVsrStateContext.Provider value={ret}>
      {children}
    </HeliumVsrStateContext.Provider>
  );
};
