import { PublicKey } from "@solana/web3.js";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { proxiesQuery } from "../queries/proxiesQuery";

export function useKnownProxy(nextVoter: PublicKey | undefined) {
  const { voteService } = useHeliumVsrState();
  const { data, isLoading, error } = useInfiniteQuery(
    proxiesQuery({
      search: nextVoter?.toBase58() || "",
      amountPerPage: 1,
      voteService,
    })
  );
  return { knownProxy: data?.pages[0][0], loading: isLoading, error };
}
