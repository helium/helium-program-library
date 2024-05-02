import { AnchorProvider, BN, IdlAccounts, Wallet } from "@coral-xyz/anchor";
import { useSolanaUnixNow } from "@helium/helium-react-hooks";
import {
  EPOCH_LENGTH,
  delegatedPositionKey,
} from "@helium/helium-sub-daos-sdk";
import { VoterStakeRegistry } from "@helium/idls/lib/types/voter_stake_registry";
import { truthy } from "@helium/spl-utils";
import { Connection, PublicKey } from "@solana/web3.js";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAsync } from "react-async-hook";
import { useDelegatedPositions } from "../hooks/useDelegatedPositions";
import { useProxies } from "../hooks/useProxies";
import { usePositions } from "../hooks/usePositions";
import { useRegistrar } from "../hooks/useRegistrar";
import { init as initNftProxy } from "@helium/nft-proxy-sdk";
import { ProxyV0, PositionWithMeta } from "../sdk/types";
import { calcPositionVotingPower } from "../utils/calcPositionVotingPower";
import {
  GetPositionsArgs as GetPosArgs,
  getPositionKeys,
} from "../utils/getPositionKeys";
import {
  VoteService,
  getRegistrarKey,
  init,
} from "@helium/voter-stake-registry-sdk";

type Registrar = IdlAccounts<VoterStakeRegistry>["registrar"];

export interface HeliumVsrState {
  amountLocked?: BN;
  amountProxyLocked?: BN;
  loading: boolean;
  mint?: PublicKey;
  positions?: PositionWithMeta[];
  provider?: AnchorProvider;
  votingPower?: BN;
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
  voteService: undefined,

  refetch: () => {},
};

const HeliumVsrStateContext = createContext<HeliumVsrState>(defaultState);

export const useHeliumVsrState = () => {
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
  const provider = useMemo(() => {
    if (connection && wallet) {
      return new AnchorProvider(connection, wallet, {
        preflightCommitment: "confirmed",
        commitment: "confirmed",
        skipPreflight: true,
      });
    }
  }, [connection?.rpcEndpoint, wallet?.publicKey?.toBase58()]);
  const me = useMemo(() => wallet?.publicKey, [wallet?.publicKey?.toBase58()]);

  /// Allow refetching all NFTs by incrementing call index
  const [callIndex, setCallIndex] = useState(0);
  const refetch = useCallback(() => setCallIndex((i) => i + 1), [setCallIndex]);
  const registrarKey = useMemo(
    () => mint && getRegistrarKey(mint),
    [mint?.toBase58()]
  );
  const urlVoteService = useMemo(() => {
    return heliumVoteUri && registrarKey
      ? new VoteService({
          baseURL: heliumVoteUri,
          registrar: registrarKey,
        })
      : undefined;
  }, [heliumVoteUri, registrarKey]);
  // Allow vote service either from native rpc or from api
  const { result: voteService } = useAsync(async () => {
    if (registrarKey) {
      if (urlVoteService) {
        return urlVoteService;
      } else {
        const program = await init(provider as any);
        const nftProxyProgram = await initNftProxy(provider as any);
        new VoteService({
          registrar: registrarKey,
          program,
          nftProxyProgram,
        });
      }
    }
  }, [provider, registrarKey, urlVoteService]);
  const args = useMemo(
    () =>
      wallet &&
      mint &&
      connection &&
      voteService &&
      ({
        wallet: provider?.publicKey,
        mint,
        provider,
        callIndex,
        voteService,
      } as GetPosArgs),
    [mint, provider, callIndex, voteService]
  );
  const { info: registrar } = useRegistrar(registrarKey);
  const { result, loading, error } = useAsync(
    async (args: GetPosArgs | undefined) => {
      if (args) {
        return await getPositionKeys(args);
      }
    },
    [args]
  );
  const delegatedPositionKeys = useMemo(() => {
    return result?.positionKeys.map((pk) => delegatedPositionKey(pk)[0]);
  }, [result?.positionKeys]);
  const { accounts: delegatedAccounts, loading: loadingDel } =
    useDelegatedPositions(delegatedPositionKeys);

  const proxyAccounts = result?.proxies;
  const proxyAccountsByAsset = useMemo(() => {
    return proxyAccounts?.reduce((acc, del) => {
      acc[del.asset.toBase58()] = del;
      return acc;
    }, {} as Record<string, ProxyV0>);
  }, [proxyAccounts]);
  const myOwnedPositionsEndIdx = result?.positionKeys?.length;
  // Assume that my positions are a small amount, so we don't need to say they're static
  const { accounts: myPositions, loading: loadingMyPositions } = usePositions(
    result?.positionKeys
  );
  // Delegated positions may be a lot, set to static
  const { accounts: delegatedPositions, loading: loadingDelPositions } =
    usePositions(result?.proxiedPositionKeys, true);
  const positions = useMemo(
    () => [...(myPositions || []), ...(delegatedPositions || [])],
    [myPositions, delegatedPositions]
  );
  const now = useSolanaUnixNow(60 * 5 * 1000);

  const { amountLocked, votingPower, positionsWithMeta, amountProxyLocked } =
    useMemo(() => {
      if (positions && registrar && delegatedAccounts && now) {
        let amountLocked = new BN(0);
        let amountProxyLocked = new BN(0);
        let votingPower = new BN(0);
        const mintCfgs = registrar?.votingMints;
        const positionsWithMeta = positions
          .map((position, idx) => {
            if (position && position.info) {
              const isDelegated = !!delegatedAccounts?.[idx]?.info;
              const proxy =
                proxyAccountsByAsset?.[position.info.mint.toBase58()];
              const delegatedSubDao = isDelegated
                ? delegatedAccounts[idx]?.info?.subDao
                : null;
              const hasRewards = isDelegated
                ? delegatedAccounts[idx]!.info!.lastClaimedEpoch.add(
                    new BN(1)
                  ).lt(new BN(now).div(new BN(EPOCH_LENGTH)))
                : false;

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
              } else {
                amountLocked = amountLocked.add(
                  position.info.amountDepositedNative
                );
              }

              votingPower = votingPower.add(posVotingPower);

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
              } as PositionWithMeta;
            }
          })
          .filter(truthy);

        return {
          positionsWithMeta,
          amountLocked,
          votingPower,
          amountProxyLocked,
        };
      }

      return {};
    }, [
      myOwnedPositionsEndIdx,
      positions,
      registrar,
      delegatedAccounts,
      proxyAccounts,
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
      loading: loading || loadingPositions || loadingDel,
      error,
      amountLocked,
      amountProxyLocked,
      mint,
      positions: sortedPositions,
      provider,
      refetch,
      votingPower,
      registrar: registrar
        ? {
            ...registrar,
            pubkey: registrarKey,
          }
        : undefined,
      voteService,
    }),
    [
      loadingPositions,
      loadingDel,
      loading,
      error,
      amountLocked,
      amountProxyLocked,
      mint,
      sortedPositions,
      provider,
      refetch,
      votingPower,
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
