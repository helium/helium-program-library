import { PublicKey } from "@solana/web3.js";
import { DC_MINT } from "../constants";
import { resolveIndividual } from "./individual";


export const heliumCommonResolver = resolveIndividual(async ({ path }) => {
  switch (path[path.length - 1]) {
    case "dataCreditsProgram":
      return new PublicKey("credacwrBVewZAgCwNgowCSMbCiepuesprUWPBeLTSg");
    case "tokenMetadataProgram":
      return new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
    case "heliumSubDaosProgram":
      return new PublicKey("hdaojPkgSD8bciDc1w2Z4kXFFibCXngJiw2GRpEL7Wf");
    default:
      return;
  }
})