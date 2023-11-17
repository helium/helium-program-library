import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
import { useSolanaUnixNow } from "@helium/helium-react-hooks";
import {
  EPOCH_LENGTH,
  delegatedPositionKey,
} from "@helium/helium-sub-daos-sdk";
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { useAsync } from "react-async-hook";
import { useDelegatedPositions } from "../hooks/useDelegatedPositions";
import { usePositions } from "../hooks/usePositions";
import { useRegistrar } from "../hooks/useRegistrar";
import { PositionWithMeta } from "../sdk/types";
import { calcPositionVotingPower } from "../utils/calcPositionVotingPower";
import {
  GetPositionsArgs as GetPosArgs,
  getPositionKeys,
  getRegistrarKey,
} from "../utils/getPositionKeys";
import { truthy } from "@helium/spl-utils";
import { Connection, PublicKey } from "@solana/web3.js";
import { delegationKey, init } from "@helium/nft-delegation-sdk";
import { useDelegations } from "../hooks/useDelegations";
import { NftDelegation } from "@helium/modular-governance-idls/lib/types/nft_delegation";
import { positionKey } from "@helium/voter-stake-registry-sdk";

export interface HeliumVsrState {
  amountLocked?: BN;
  loading: boolean;
  mint?: PublicKey;
  positions?: PositionWithMeta[];
  provider?: AnchorProvider;
  votingPower?: BN;

  refetch: () => void;
}

const defaultState: HeliumVsrState = {
  amountLocked: new BN(0),
  loading: false,
  mint: undefined,
  positions: [],
  provider: undefined,
  votingPower: new BN(0),

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
}> = ({ wallet, mint, connection, children }) => {
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
  const args = useMemo(
    () =>
      wallet &&
      mint &&
      connection &&
      ({
        wallet: provider?.publicKey,
        mint,
        provider,
        callIndex,
      } as GetPosArgs),
    [mint, provider, callIndex]
  );
  const registrarKey = useMemo(
    () => mint && getRegistrarKey(mint),
    [mint?.toBase58()]
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

  const delegationKeys = useMemo(() => {
    return (
      me &&
      registrar &&
      result?.nfts.map(
        (nft) => delegationKey(registrar.delegationConfig, nft.address!, me)[0]
      )
    );
  }, [result?.nfts, me?.toBase58()]);
  const { accounts: delegationAccounts, loading: loadingDelegations } =
    useDelegations(delegationKeys);

  const allPositions = useMemo(
    () => [
      ...(result?.positionKeys || []),
      ...(result?.votingDelegatedPositionKeys || []),
    ],
    [result?.positionKeys, result?.votingDelegatedPositionKeys]
  );
  const myOwnedPositionsEndIdx = result?.positionKeys?.length;
  const { accounts: positions, loading: loadingPositions } =
    usePositions(allPositions);
  const now = useSolanaUnixNow(60 * 5 * 1000);

  const { amountLocked, votingPower, positionsWithMeta } = useMemo(() => {
    if (positions && registrar && delegatedAccounts && now) {
      let amountLocked = new BN(0);
      let votingPower = new BN(0);
      const mintCfgs = registrar?.votingMints;
      const positionsWithMeta = positions
        .map((position, idx) => {
          if (position && position.info) {
            const isDelegated = !!delegatedAccounts?.[idx]?.info;
            const delegation = delegationAccounts?.[idx]?.info;
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

            amountLocked = amountLocked.add(
              position.info.amountDepositedNative
            );
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
              isVotingDelegatedToMe: idx >= (myOwnedPositionsEndIdx || 0),
              votingDelegation: {
                ...delegation,
                address: delegationAccounts?.[idx]?.publicKey,
              },
            } as PositionWithMeta;
          }
        })
        .filter(truthy);

      return {
        positionsWithMeta,
        amountLocked,
        votingPower,
      };
    }

    return {};
  }, [
    myOwnedPositionsEndIdx,
    positions,
    registrar,
    delegatedAccounts,
    delegationAccounts,
  ]);
  const ret = useMemo(
    () => ({
      loading: loading || loadingPositions || loadingDel,
      error,
      amountLocked,
      mint,
      positions: positionsWithMeta,
      provider,
      refetch,
      votingPower,
    }),
    [
      loadingPositions,
      loadingDel,
      loading,
      error,
      amountLocked,
      mint,
      positionsWithMeta,
      provider,
      refetch,
      votingPower,
    ]
  );
  return (
    <HeliumVsrStateContext.Provider value={ret}>
      {children}
    </HeliumVsrStateContext.Provider>
  );
};
