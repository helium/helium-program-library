import { AnchorProvider, Program } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { HotspotIssuance } from "../../../target/types/hotspot_issuance";
import { PROGRAM_ID } from "./constants";

export const init = async (
  provider: AnchorProvider,
  hotspotIssuerProgramId: PublicKey = PROGRAM_ID
): Promise<Program<HotspotIssuance>> => {
  const hotspotIssuerIdlJson = await Program.fetchIdl(
    hotspotIssuerProgramId,
    provider
  );

  const hotspotIssuance = new Program<HotspotIssuance>(
    hotspotIssuerIdlJson as HotspotIssuance,
    hotspotIssuerProgramId,
    provider
  ) as Program<HotspotIssuance>;

  return hotspotIssuance;
};

export * from "./instructions";
export * from "./pdas";
