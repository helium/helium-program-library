import { AnchorProvider } from "@coral-xyz/anchor";
import { HNT_MINT, IOT_MINT, MOBILE_MINT } from "@helium/spl-utils";
import {
  init as initVsr,
  positionKey,
  registrarKey,
} from "@helium/voter-stake-registry-sdk";
import { Metadata, Metaplex, Nft, Sft } from "@metaplex-foundation/js";
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
): Promise<{ positionKeys: PublicKey[]; nfts: (Metadata | Nft | Sft)[] }> => {
  const { mint, wallet, provider } = args;
  const connection = provider.connection;

  const metaplex = new Metaplex(connection);
  const registrarPk = getRegistrarKey(mint);
  const program = await initVsr(provider as any);
  const registrar = (await program.account.registrar.fetch(
    registrarPk
  )) as Registrar;

  const nfts = (await metaplex.nfts().findAllByOwner({ owner: wallet })).filter(
    (nft) => nft.collection?.address.equals(registrar.collection)
  );

  const positionKeys = nfts.map(
    (nft) => positionKey((nft as any).mintAddress)[0]
  );

  return { positionKeys, nfts };
};
