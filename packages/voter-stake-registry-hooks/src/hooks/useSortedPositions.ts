import { useMemo } from "react";
import { useSolanaUnixNow } from "@helium/helium-react-hooks";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { calcPositionVotingPower } from "../utils/calcPositionVotingPower";
import BN from "bn.js";

const PROXIED_LIMIT = 50;

export function useSortedPositions() {
  const { positions, provider, registrar } = useHeliumVsrState();
  const unixNow = useSolanaUnixNow();
  return useMemo(() => {
    const allPositions =
      unixNow && positions
        ? positions
            .sort((a, b) => {
              if (a.isProxiedToMe) return 1;
              if (b.isProxiedToMe) return -1;
              return -calcPositionVotingPower({
                position: a,
                registrar: registrar || null,
                unixNow: new BN(unixNow),
              }).cmp(
                calcPositionVotingPower({
                  position: b,
                  registrar: registrar || null,
                  unixNow: new BN(unixNow),
                })
              );
            })
            .map((p, index) => ({ ...p, index }))
        : [];
    const proxiedToMeIndex = allPositions.findIndex((p) => p.isProxiedToMe);

    // Limit number of proxied positions so we dont overwhelm the websocket
    return allPositions.slice(0, proxiedToMeIndex + PROXIED_LIMIT);
  }, [positions, unixNow]);
}