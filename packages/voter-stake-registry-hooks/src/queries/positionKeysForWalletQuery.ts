import { getPositionKeysForOwner } from "@helium/voter-stake-registry-sdk";
import { Connection, PublicKey } from "@solana/web3.js";
import { queryOptions } from "@tanstack/react-query";

export function positionKeysForWalletQuery({
  wallet,
  registrar,
  connection,
}: {
  wallet?: PublicKey;
  registrar?: PublicKey;
  connection?: Connection
}) {
  return queryOptions({
    queryKey: [
      "positionKeys",
      {
        wallet,
        registrar: registrar?.toBase58(),
        rpcEndpoint: connection?.rpcEndpoint,
      },
    ],
    queryFn: () =>
      getPositionKeysForOwner({
        connection: connection!,
        owner: wallet!,
        registrar: registrar!,
      }),
    enabled: !!connection && !!wallet && !!registrar,
  });
}
