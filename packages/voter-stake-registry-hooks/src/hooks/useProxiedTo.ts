import { useSolanaUnixNow } from "@helium/helium-react-hooks";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { useMemo } from "react";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { PositionWithMeta } from "../sdk/types";
import { calcPositionVotingPower } from "../utils/calcPositionVotingPower";

export function useProxiedTo(wallet?: PublicKey): {
  positions?: PositionWithMeta[];
  votingPower?: BN;
} {
  const { positions, registrar } = useHeliumVsrState();
  const now = useSolanaUnixNow(60 * 5 * 1000);

  const result = useMemo(() => {
    if (wallet) {
      return positions?.filter(
        (position) =>
          position.proxy &&
          position.proxy.nextOwner.equals(wallet)
      );
    }
  }, [positions]);
  const votingPower = useMemo(() => {
    if (registrar && now)
      return result?.reduce((acc, position) => {
        const power = calcPositionVotingPower({
          position: position,
          registrar,
          unixNow: new BN(now),
        });
        acc = acc.add(power);
        return acc;
      }, new BN(0));
  }, [result, registrar, now]);

  return {
    positions: result,
    votingPower,
  };
}
