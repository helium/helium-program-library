import {
  InstructionResult,
  AnchorSdk,
  TypedAccountParser,
  toBN,
} from "@helium-foundation/spl-utils";
import { PublicKey, Commitment, TransactionInstruction } from "@solana/web3.js";
import { AnchorProvider, IdlAccounts, Program } from "@project-serum/anchor";
import { PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
import { HotspotIssuer } from "../../../target/types/hotspot_issuer";

type HotspotIssuerV0 = IdlAccounts<HotspotIssuer>["hotspotIssuerV0"];

export interface IHotspotIssuer extends HotspotIssuerV0 {
  publicKey: PublicKey;
}

export interface IInitializeHotspotIssuerArgs {
  /**
   * The payer for this tx. **Default:** this.wallet
   */
  payer?: PublicKey;
  /**
   * The wallet that can make changes to this issuer. **Default**: this.wallet
   */
  authority?: PublicKey;
  /**
   * Token metadata that, will create metaplex spl-token-metadata for this collection.
   *
   */
  metadata: {
    name: string;
    symbol: string;
    uri: string;
  };
  onboarding_server: PublicKey;
}

export class HotspotIssuerSdk extends AnchorSdk<HotspotIssuer> {
  static ID = new PublicKey("mXiWEGtETaoSV4e9VgVg9i5Atf95DRN7Pn3L9dXLi6A");

  constructor(provider: AnchorProvider, program: Program<HotspotIssuer>) {
    super({ provider, program });
  }

  static async init(
    provider: AnchorProvider,
    hotspotIssuerProgramId: PublicKey = HotspotIssuerSdk.ID
  ): Promise<HotspotIssuerSdk> {
    const hotspotIssuerIdlJson = await Program.fetchIdl(
      hotspotIssuerProgramId,
      provider
    );

    const hotspotIssuer = new Program<HotspotIssuer>(
      hotspotIssuerIdlJson as HotspotIssuer,
      hotspotIssuerProgramId,
      provider
    ) as Program<HotspotIssuer>;

    return new this(provider, hotspotIssuer);
  }

  hotspotIssuerDecoder: TypedAccountParser<IHotspotIssuer> = (
    pubkey,
    account
  ) => {
    const coded = this.program.coder.accounts.decode<HotspotIssuerV0>(
      "HotspotIssuerV0",
      account.data
    );

    return {
      ...coded,
      publicKey: pubkey,
    };
  };

  async getHotspotIssuer(
    hotspotIssuer: PublicKey
  ): Promise<IHotspotIssuer | null> {
    return this.getAccount(hotspotIssuer, this.hotspotIssuerDecoder);
  }

  static hotspotIssuerKey(
    collection: PublicKey,
    programId: PublicKey = HotspotIssuerSdk.ID
  ): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [Buffer.from("hotspot-issuer", "utf-8"), collection.toBuffer()],
      programId
    );
  }

  async initializeHotspotIssuerInstructions({
    payer = this.wallet.publicKey,
    authority = this.wallet.publicKey,
  }: IInitializeHotspotIssuerArgs): Promise<
    InstructionResult<{ hotspotIssuer: PublicKey }>
  > {
    const instruction = await this.program.methods
      .initializeHotspotIssuerV0({})
      .accounts({})
      .instruction();

    return {
      signers: [],
      instructions: [instruction],
      output: {
        hotspotIssuer,
      },
    };
  }

  async initializeHotspotIssuerV0(
    args: IInitializeHotspotIssuerArgs,
    commitment: Commitment = "confirmed"
  ): Promise<{ hotspotIssuer: PublicKey }> {
    return this.execute(await this.initializeHotspotIssuerInstructions(args));
  }
}
