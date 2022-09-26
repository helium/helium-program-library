import { AnchorProvider, Program } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { HotspotIssuer } from "../../../target/types/hotspot_issuer";
import { PROGRAM_ID } from "./constants";

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
