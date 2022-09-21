import { PublicKey, Keypair, TransactionInstruction } from "@solana/web3.js";
import { AnchorProvider, Program } from "@project-serum/anchor";
import { PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";

import { hotspotIssuerKey, collectionMetadataKey } from "./pdas";
import { HotspotIssuer } from "../../../target/types/hotspot_issuer";
import { InstructionResult } from "@helium-foundation/spl-utils";

export interface IInitializeHotspotIssuerArgs {
  program: Program<HotspotIssuer>;
  provider: AnchorProvider;
  /**
   * The payer for this txn. **Default:** this.wallet
   */
  payer?: PublicKey;
  /**
   * The wallet that can make changes to this distributor. **Default**: this.wallet
   */
  authority?: PublicKey;
  onboardingServer: PublicKey;
  metadata: {
    name: string;
    symbol: string;
    uri: string;
  };
}

export const initializeHotspotIssuerInstructions = async ({
  program,
  provider,
  payer = provider.wallet.publicKey,
  authority = provider.wallet.publicKey,
  onboardingServer,
  metadata,
}: IInitializeHotspotIssuerArgs): Promise<
  InstructionResult<{ hotspotIssuer: PublicKey }>
> => {
  const instructions: TransactionInstruction[] = [];
  const { publicKey: collectionKey } = Keypair.generate();
  const [hotspotIssuerPDA] = hotspotIssuerKey({ collection: collectionKey });
  const [metadataPDA] = collectionMetadataKey({ collection: collectionKey });

  instructions.push(
    await program.methods
      .initializeHotspotIssuerV0({
        name: metadata.name,
        symbol: metadata.symbol,
        uri: metadata.uri,
        authority,
        onboardingServer,
      })
      .accounts({
        payer,
        collection: collectionKey,
        metadata: metadataPDA,
        hotspotIssuer: hotspotIssuerPDA,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
      })
      .instruction()
  );

  return {
    signers: [],
    instructions,
    output: {
      hotspotIssuer: hotspotIssuerPDA,
    },
  };
};

export interface IMintAndClaimHotspotArgs {}
export const mintAndClaimHotspotInstructions =
  async ({}: IMintAndClaimHotspotArgs) => {};
