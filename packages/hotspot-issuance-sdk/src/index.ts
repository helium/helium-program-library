import { AnchorProvider, Idl, Program } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { ataResolver, combineResolvers } from "@helium-foundation/spl-utils";
import { HotspotIssuance } from "../../../target/types/hotspot_issuance";
import { PROGRAM_ID } from "./constants";

export const init = async (
  provider: AnchorProvider,
  hotspotIssuanceProgramId: PublicKey = PROGRAM_ID,
  hotspotIssuanceIdl: Idl | null
): Promise<Program<HotspotIssuance>> => {
  if (!hotspotIssuanceIdl) {
    hotspotIssuanceIdl = await Program.fetchIdl(
      hotspotIssuanceProgramId,
      provider
    );
  }

  const hotspotIssuance = new Program<HotspotIssuance>(
    hotspotIssuanceIdl as HotspotIssuance,
    hotspotIssuanceProgramId,
    provider,
    undefined,
    () =>
      combineResolvers(
        ataResolver({
          instruction: "initializeHotspotConfigV0",
          account: "tokenAccount",
          mint: "collection",
          owner: "hotspotConfig",
        }),
        ataResolver({
          instruction: "issueHotspotV0",
          account: "recipientTokenAccount",
          mint: "hotspot",
          owner: "hotspotOwner",
        })
      )
  ) as Program<HotspotIssuance>;

  return hotspotIssuance;
};

// export * from "./instructions";
export * from "./pdas";
