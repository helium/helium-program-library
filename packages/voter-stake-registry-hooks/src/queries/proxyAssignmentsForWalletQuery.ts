import { VoteService } from "@helium/voter-stake-registry-sdk";
import { PublicKey } from "@solana/web3.js";
import { queryOptions } from "@tanstack/react-query";

export function proxyAssignmentsForWalletQuery({
  wallet,
  voteService,
}: {
  wallet?: PublicKey;
  voteService?: VoteService;
}) {
  return queryOptions({
    queryKey: [
      "proxyAssignmentsForWallet",
      {
        ...voteService?.config,
        wallet: wallet?.toBase58(),
      },
    ],
    queryFn: () => voteService!.getProxyAssignmentsForWallet(wallet!),
    enabled: !!wallet && !!voteService,
  });
}
