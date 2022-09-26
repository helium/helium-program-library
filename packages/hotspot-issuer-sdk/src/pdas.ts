import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import { PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";

export const hotspotIssuerKey = ({
  programId = PROGRAM_ID,
  collection,
}: {
  programId?: PublicKey;
  collection: PublicKey;
}) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("hotspot_issuer", "utf-8"), collection.toBuffer()],
    programId
  );

export const collectionMetadataKey = ({
  programId = TOKEN_METADATA_PROGRAM_ID,
  collection,
}: {
  programId?: PublicKey;
  collection: PublicKey;
}) =>
  PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata", "utf-8"),
      programId.toBuffer(),
      collection.toBuffer(),
    ],
    programId
  );
