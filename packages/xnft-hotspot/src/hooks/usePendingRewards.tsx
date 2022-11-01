import { PublicKey } from "@solana/web3.js";
import { useMemo, useState } from "react";
import { useInterval } from "./useInterval";
import {
  getPendingRewards,
  LAZY_KEY,
  useProgram
} from "../utils/index";
import { recipientKey as getRecipientKey } from "@helium/lazy-distributor-sdk";
import { useRecipient } from "./useRecipient";

export function usePendingRewards(mint: PublicKey): number | null {
  const program = useProgram();
  const [pendingRewards, setPendingRewards] = useState<number | null>(null);
   const recipientKey = useMemo(() => {
     return getRecipientKey(LAZY_KEY, mint)[0];
   }, [mint.toBase58()]);
  const { info: recipient, loading, account } = useRecipient(recipientKey);

  useInterval(
    () => {
      (async () => {
        try {
          if (program && !loading) {
            //@ts-ignore
            const { pendingRewards: rewards, rewardsMint: rwdMint } =
              await getPendingRewards(program, mint, recipient);
            setPendingRewards(rewards);
          }
        } catch (e: any) {
          console.error(e);
        }
      })();
    },
    30 * 1000,
    [program, loading, recipient, mint.toBase58()]
  );

  return pendingRewards;
}
