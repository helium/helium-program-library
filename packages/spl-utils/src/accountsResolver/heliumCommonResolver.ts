import { PublicKey } from "@solana/web3.js";
import { resolveIndividual } from "./individual";


export const heliumCommonResolver = resolveIndividual(async ({ path }) => {
  switch (path[path.length - 1]) {
    case "dataCreditsProgram":
      return new PublicKey("credacwrBVewZAgCwNgowCSMbCiepuesprUWPBeLTSg");
    case "tokenMetadataProgram":
      return new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
    case "heliumSubDaosProgram":
      return new PublicKey("hdaojPkgSD8bciDc1w2Z4kXFFibCXngJiw2GRpEL7Wf");
    case "bubblegumProgram":
      return new PublicKey("BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY");
    case "compressionProgram":
      return new PublicKey("cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK");
    case "logWrapper":
      return new PublicKey("noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV");
    case "governanceProgramId":
      return new PublicKey("GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw");
    case "voterStakeRegistryProgramId":
      return new PublicKey("hvsrY9UBtHhYRvstM2BWCsni81kevfn7B2DEhYbGA1a");
    case "vsrProgram":
      return new PublicKey("hvsrY9UBtHhYRvstM2BWCsni81kevfn7B2DEhYbGA1a");
    case "instructions":
      return new PublicKey("Sysvar1nstructions1111111111111111111111111");
    default:
      return;
  }
});