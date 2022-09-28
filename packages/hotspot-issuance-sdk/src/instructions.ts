import { AnchorProvider, Program } from "@project-serum/anchor";
import { InstructionResult } from "@helium-foundation/spl-utils";
import { PublicKey, TransactionInstruction, Keypair } from "@solana/web3.js";
import { HotspotIssuance } from "../../../target/types/hotspot_issuance";

export interface IIssueHotspotArgs {
  program: Program<HotspotIssuance>;
  provider: AnchorProvider;
  /** Payer for this transaction. **Default** this.wallet */
  payer?: PublicKey;
  /** Payer for the dc to burn on this transaction **Default** this.wallet */
  dcFeePayer?: PublicKey;
  /** Address to send the hotspot NFT too */
  recipient: PublicKey;
  collection: PublicKey;
  maker: PublicKey;
  metadata: {
    name: string;
    symbol: string;
    url: string;
  };
}

export interface IIssueHotspotOutput {}

export const issueHotspotInstructions = async ({
  program,
  provider,
  payer = provider.wallet.publicKey,
  dcFeePayer = provider.wallet.publicKey,
  recipient,
  collection,
  maker,
  metadata,
}: IIssueHotspotArgs): Promise<InstructionResult<IIssueHotspotOutput>> => {
  const instructions: TransactionInstruction[] = [];
  const signers: Keypair[] = [];

  return {
    instructions,
    signers,
    output: {},
  };
};
