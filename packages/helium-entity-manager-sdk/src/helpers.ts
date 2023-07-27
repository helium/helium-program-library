import { daoKey } from "@helium/helium-sub-daos-sdk";
import { Asset, HNT_MINT } from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import { keyToAssetKey } from "./pdas";

export const HELIUM_DAO = daoKey(HNT_MINT)[0];

export function keyToAssetForAsset(
  asset: Asset,
  dao: PublicKey = HELIUM_DAO
): PublicKey {
  if (asset.creators[1]) {
    return asset.creators[1].address;
  }

  const entityKey = asset.content.json_uri.split("/").slice(-1)[0] as string;
  let keySerialization: BufferEncoding | "b58" = "b58";
  if (new Set(["IOT OPS", "CARRIER"]).has(asset.content.metadata.symbol)) {
    keySerialization = "utf8";
  }

  return keyToAssetKey(dao, entityKey, keySerialization)[0];
}
