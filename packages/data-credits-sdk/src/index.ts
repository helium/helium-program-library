import {
  InstructionResult,
  AnchorSdk,
  TypedAccountParser,
  toBN,
} from "@helium-foundation/spl-utils";
import { DataCredits } from "../../../target/types/data_credits";
import { PublicKey, Commitment, TransactionInstruction } from "@solana/web3.js";
import {
  AnchorProvider,
  IdlAccounts,
  IdlTypes,
  Program,
} from "@project-serum/anchor";
import BN from "bn.js";
import { PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
import {
  createAssociatedTokenAccount,
  createAssociatedTokenAccountInstruction,
  getAccount,
  getAssociatedTokenAddress,
  getMint,
} from "@solana/spl-token";

type DataCreditsV0 = IdlAccounts<DataCredits>["dataCreditsV0"];

export interface IDataCredits extends DataCreditsV0 {
  publicKey: PublicKey;
}

export interface IInitializeDataCreditsArgs {
  /** The mint for HNT token. These tokens are burned to mint DC */
  hntMint: PublicKey,
  /** The mint for the DC token. These tokens can be minted and burned, but not transferred */
  dcMint: PublicKey,
  /** Payer for this transaction. **Default** this.wallet */
  payer?: PublicKey,
  /** General authority for changing the program config. **Default** this.wallet */
  authority?: PublicKey
}

export interface IMintDataCreditsArgs {
  auth_bump: number;
  amount: BN | number;
}

export class DataCreditsSdk extends AnchorSdk<DataCredits> {
  static ID = new PublicKey("5BAQuzGE1z8CTcrSdfbfdBF2fdXrwb4iMcxDMrvhz8L8");

  static async init(
    provider: AnchorProvider,
    dataCreditsProgramId: PublicKey = DataCreditsSdk.ID
  ): Promise<DataCreditsSdk> {
    const dataCreditsIdlJson = await Program.fetchIdl(
      dataCreditsProgramId,
      provider
    );
    const dataCredits = new Program<DataCredits>(
      dataCreditsIdlJson as DataCredits,
      dataCreditsProgramId,
      provider
    ) as Program<DataCredits>;

    return new this(provider, dataCredits);
  }

  constructor(provider: AnchorProvider, program: Program<DataCredits>) {
    super({ provider, program });
  }

  dataCreditsDecoder: TypedAccountParser<IDataCredits> = (
    pubkey,
    account
  ) => {
    const coded = this.program.coder.accounts.decode<DataCreditsV0>(
      "DataCreditsV0",
      account.data
    );

    return {
      ...coded,
      publicKey: pubkey,
    };
  };

  async getDataCredits(
    dataCredits: PublicKey
  ): Promise<IDataCredits | null> {
    return this.getAccount(dataCredits, this.dataCreditsDecoder);
  }

  static dataCreditsKey(
    programId: PublicKey = DataCreditsSdk.ID
  ): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [
        Buffer.from("dc", "utf-8"),
      ],
      programId
    );
  }

  static tokenAuthorityKey(
    programId: PublicKey = DataCreditsSdk.ID
  ): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [
        Buffer.from("dc_token_auth", "utf-8"),
      ],
      programId
    );
  }

  async initializeDataCreditsInstructions({
    hntMint,
    dcMint,
    payer = this.wallet.publicKey,
    authority = this.wallet.publicKey,
  }: IInitializeDataCreditsArgs) {
    const [dataCredits] = await DataCreditsSdk.dataCreditsKey();
    const instruction = await this.program.methods.initializeDataCreditsV0({authority}).accounts({
      dataCredits,
      hntMint,
      dcMint,
      payer
    }).instruction();

    return {
      signers: [],
      instructions: [instruction],
      output: {
        dataCredits,
      },
    };
  }

  async initializeDataCredits(
    args: IInitializeDataCreditsArgs,
    commitment: Commitment = "confirmed"
  ) {
    return this.execute(
      await this.initializeDataCreditsInstructions(args),
      args.payer,
      commitment
    );
  }
  
}
