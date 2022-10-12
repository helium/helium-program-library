import { AnchorProvider, Idl, Program } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { HotspotIssuance } from "../../../target/types/hotspot_issuance";
import { PROGRAM_ID } from "./constants";
import { hotspotIssuanceResolvers } from "./resolvers";
export * from "./pdas";
export * from "./resolvers";

export const init = async (
  provider: AnchorProvider,
  programId: PublicKey = PROGRAM_ID,
  idl?: Idl | null
): Promise<Program<HotspotIssuance>> => {
  if (!idl) {
    idl = await Program.fetchIdl(programId, provider);
  }

  const hotspotIssuance = new Program<HotspotIssuance>(
    idl as HotspotIssuance,
    programId,
    provider,
    undefined,
    () => hotspotIssuanceResolvers
  ) as Program<HotspotIssuance>;

  return hotspotIssuance;
};
