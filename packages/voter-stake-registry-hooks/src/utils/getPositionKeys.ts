import { AnchorProvider } from "@coral-xyz/anchor";
import {
  Asset,
  HNT_MINT,
  IOT_MINT,
  MOBILE_MINT,
  searchAssets,
} from "@helium/spl-utils";
import {
  init as initVsr,
  positionKey,
  registrarKey,
} from "@helium/voter-stake-registry-sdk";
import { PublicKey } from "@solana/web3.js";
import { Registrar } from "../sdk/types";

export interface GetPositionsArgs {
  wallet: PublicKey;
  mint: PublicKey;
  provider: AnchorProvider;
}

export function getRegistrarKey(mint: PublicKey) {
  return registrarKey(
    PublicKey.findProgramAddressSync(
      [
        Buffer.from("governance", "utf-8"),
        Buffer.from(realmNames[mint.toBase58()], "utf-8"),
      ],
      new PublicKey("hgovkRU6Ghe1Qoyb54HdSLdqN7VtxaifBzRmh9jtd3S")
    )[0],
    mint
  )[0];
}

const realmNames: Record<string, string> = {
  [HNT_MINT.toBase58()]: "Helium",
  [MOBILE_MINT.toBase58()]: "Helium MOBILE",
  [IOT_MINT.toBase58()]: "Helium IOT",
};
export const getPositionKeys = async (
  args: GetPositionsArgs
): Promise<{ positionKeys: PublicKey[] }> => {
  const { mint, wallet, provider } = args;
  const registrarPk = getRegistrarKey(mint);
  const program = await initVsr(provider as any);
  const registrar = (await program.account.registrar.fetch(
    registrarPk
  )) as Registrar;

  let page = 1;
  const limit = 1000;
  let allAssets: Asset[] = [];
  while (true) {
    const assets =
      (await searchAssets(provider.connection.rpcEndpoint, {
        page,
        limit,
        ownerAddress: wallet.toBase58(),
        tokenType: "fungible",
        collection: registrar.collection.toBase58(),
      })) || [];

    allAssets = allAssets.concat(assets);

    if (assets.length < limit) {
      break;
    }

    page++;
  }

  const positionKeys = allAssets
    .filter((asset) =>
      asset.grouping?.find(
        (group) =>
          group.group_key === "collection" &&
          group.group_value.equals(registrar.collection)
      )
    )
    .map((asset) => positionKey(asset.id)[0]);

  return { positionKeys };
};
