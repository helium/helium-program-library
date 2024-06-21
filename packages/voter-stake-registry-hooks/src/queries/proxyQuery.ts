import { networksToMint } from "@helium/spl-utils";
import { PartialEnhancedProxy, VoteService, getRegistrarKey } from "@helium/voter-stake-registry-sdk";
import { PublicKey } from "@solana/web3.js";
import { queryOptions } from "@tanstack/react-query";

export function proxyQuery({
  wallet,
  voteService,
}: {
  wallet: PublicKey;
  voteService?: VoteService;
}) {
  return queryOptions({
    enabled: !!voteService,
    queryKey: [
      "proxy",
      {
        wallet: wallet.toBase58(),
        ...voteService?.config,
      },
    ],
    queryFn: async () => {
      const registrars = await voteService!.getRegistrarsForProxy(wallet);
      let networks;
      if (registrars) {
        networks = new Set(
          Object.entries(networksToMint)
            .filter(([_, mint]) => {
              return registrars.includes(getRegistrarKey(mint).toBase58());
            })
            .map(([network]) => network)
        );
      }

      const proxy = await voteService!.getProxy(wallet);
      let detail: string | null = null;
      if (proxy.detail) {
        const res = await fetch(proxy.detail);
        detail = await res.text();
      }

      return {
        ...proxy,
        detail: detail ?? proxy.detail,
        networks,
      } as PartialEnhancedProxy;
    },
  });
}
