import create, { State } from "zustand";
import { BN } from "@coral-xyz/anchor";
import { ProgramAccount } from "@solana/spl-governance";
import { PositionWithMeta } from "../sdk/types";
import {
  GetPositionsArgs as GetPosArgs,
  getPositions,
} from "../utils/getPositionKeys";
import { MaxVoterWeightRecord } from "@solana/spl-governance";
import React, { useMemo } from "react";
import { useAnchorProvider } from "@helium/helium-react-hooks";
import { useAsync } from "react-async-hook";

export interface HeliumVsrState {
  positions: PositionWithMeta[];
  amountLocked: BN;
  votingPower: BN;
  isLoading: boolean;
}

const defaultState: HeliumVsrState = {
  positions: [],
  amountLocked: new BN(0),
  votingPower: new BN(0),
  isLoading: false,
};

const HeliumVsrStateContext = React.createContext<HeliumVsrState>(defaultState);

export const useHeliumVsrState = () => React.useContext(HeliumVsrStateContext);

export const HeliumVsrStateProvider: React.FC<
  React.PropsWithChildren<Omit<GetPosArgs, "provider">>
> = ({ wallet, mint, children }) => {
  const provider = useAnchorProvider();
  const args = useMemo(
    () => ({ wallet, mint, provider }),
    [wallet, mint, provider]
  );
  const { result: { positionKeys } = {}, loading, error } = useAsync(getPositions, [args]);
  const { accounts: positions } = useAccounts()

  const ret = useMemo(
    () => ({ ...positions, isLoading: loading, error }),
    [positions, loading, error]
  );
  return (
    <HeliumVsrStateContext.Provider value={ret}>
      {children}
    </HeliumVsrStateContext.Provider>
  );
};
