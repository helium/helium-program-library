import { AnchorSdk } from "@helium-foundation/spl-utils";
import { AnchorProvider, Program } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { HotspotIssuer } from "../../../target/types/hotspot_issuer";

export const PROGRAM_ID = new PublicKey(
  "mXiWEGtETaoSV4e9VgVg9i5Atf95DRN7Pn3L9dXLi6A"
);

export const init = async (
  provider: AnchorProvider,
  hotspotIssuerProgramId: PublicKey = PROGRAM_ID
): Promise<Program<HotspotIssuer>> => {
  const hotspotIssuerIdlJson = await Program.fetchIdl(
    hotspotIssuerProgramId,
    provider
  );

  const hotspotIssuer = new Program<HotspotIssuer>(
    hotspotIssuerIdlJson as HotspotIssuer,
    hotspotIssuerProgramId,
    provider
  ) as Program<HotspotIssuer>;

  return hotspotIssuer;
};

export * from "./instructions";
export * from "./pdas";
