import { BN } from "@coral-xyz/anchor";
import {
  useAnchorProvider,
  useSolanaUnixNow,
} from "@helium/helium-react-hooks";
import {
  EPOCH_LENGTH,
  delegatedPositionKey,
} from "@helium/helium-sub-daos-sdk";
import React, { useCallback, useMemo, useState } from "react";
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
import { PublicKey } from "@solana/web3.js";

export interface HeliumVsrState {
  positions?: PositionWithMeta[];
  amountLocked?: BN;
  votingPower?: BN;
  loading: boolean;
  mint?: PublicKey;
  refetch: () => void;
}

const defaultState: HeliumVsrState = {
  positions: [],
  amountLocked: new BN(0),
  votingPower: new BN(0),
  loading: false,
  refetch: () => {},
  mint: undefined,
};

const HeliumVsrStateContext = React.createContext<HeliumVsrState>(defaultState);

export const useHeliumVsrState = () => React.useContext(HeliumVsrStateContext);

export const HeliumVsrStateProvider: React.FC<
  React.PropsWithChildren<Omit<Partial<GetPosArgs>, "provider">>
> = ({ wallet, mint, children }) => {
  const provider = useAnchorProvider();
  /// Allow refetching all NFTs by incrementing call index
  const [callIndex, setCallIndex] = useState(0);
  const refetch = useCallback(() => setCallIndex((i) => i + 1), [setCallIndex]);
  const args = useMemo(
    () => wallet && mint && provider && { wallet, mint, provider, callIndex } as GetPosArgs,
    [wallet, mint, provider, callIndex]
  );
  const registrarKey = useMemo(
    () => mint && getRegistrarKey(mint),
    [mint?.toBase58()]
  );
  const { info: registrar } = useRegistrar(registrarKey);
  const { result, loading, error } = useAsync(
    async (args: GetPosArgs | undefined) => {
      if (args) {
        return getPositionKeys(args)
      }
    },
    [args]
  );
  const delegatedPositionKeys = useMemo(() => {
    return result?.positionKeys.map((pk) => delegatedPositionKey(pk)[0]);
  }, [result?.positionKeys]);
  const { accounts: delegatedAccounts, loading: loadingDel } =
    useDelegatedPositions(delegatedPositionKeys);
  const { accounts: positions, loading: accountsLoading } = usePositions(
    result?.positionKeys
  );
  const now = useSolanaUnixNow(60 * 5 * 1000);

  const { amountLocked, votingPower, positionsWithMeta } = useMemo(() => {
    if (positions && registrar && delegatedAccounts && now) {
      let amountLocked = new BN(0);
      let votingPower = new BN(0);
      const mintCfgs = registrar?.votingMints;
      const positionsWithMeta = positions.map((position, idx) => {
        if (position && position.info) {
          const isDelegated = !!delegatedAccounts[idx];
          const delegatedSubDao = isDelegated
            ? delegatedAccounts[idx]?.info?.subDao
            : null;
          const hasRewards = isDelegated
            ? delegatedAccounts[idx]!.info!.lastClaimedEpoch.add(new BN(1)).lt(
                new BN(now).div(new BN(EPOCH_LENGTH))
              )
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
      }).filter(truthy);

      return {
        positionsWithMeta,
        amountLocked,
        votingPower,
      };
    }

    return {};
  }, [positions, registrar, delegatedAccounts]);
  const ret = useMemo(
    () => ({
      loading: loading || accountsLoading || loadingDel,
      error,
      positions: positionsWithMeta,
      amountLocked,
      votingPower,
      mint,
      refetch,
    }),
    [
      refetch,
      loading,
      accountsLoading,
      loadingDel,
      error,
      positionsWithMeta,
      amountLocked,
      votingPower,
      mint
    ]
  );
  return (
    <HeliumVsrStateContext.Provider value={ret}>
      {children}
    </HeliumVsrStateContext.Provider>
  );
};
