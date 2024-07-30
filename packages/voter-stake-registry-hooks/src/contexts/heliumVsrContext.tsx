import { AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
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

export interface HeliumVsrState {
  amountLocked?: BN;
  loading: boolean;
  mint?: PublicKey;
  positions?: PositionWithMeta[];
  provider?: AnchorProvider;
  votingPower?: BN;
  unixNow?: number;

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
        return getPositionKeys(args);
      }
    },
    [args]
  );
  const delegatedPositionKeys = useMemo(() => {
    return result?.positionKeys.map((pk) => delegatedPositionKey(pk)[0]);
  }, [result?.positionKeys]);
  const { accounts: delegatedAccounts, loading: loadingDel } =
    useDelegatedPositions(delegatedPositionKeys);
  const { accounts: positions, loading: loadingPositions } = usePositions(
    result?.positionKeys
  );
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
  }, [positions, registrar, delegatedAccounts, now]);
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
      unixNow: now,
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
      now,
    ]
  );
  return (
    <HeliumVsrStateContext.Provider value={ret}>
      {children}
    </HeliumVsrStateContext.Provider>
  );
};
