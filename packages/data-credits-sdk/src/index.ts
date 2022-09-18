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
  hntMint: PublicKey;
  /** The mint for the DC token. These tokens can be minted and burned, but not transferred */
  dcMint: PublicKey;
  /** Payer for this transaction. **Default** this.wallet */
  payer?: PublicKey;
  /** General authority for changing the program config. **Default** this.wallet */
  authority?: PublicKey;
}


export interface IMintDataCreditsArgs {
  /** Amount of HNT to burn */
  amount: BN | number;
  /** Address to send the DC to. **Default** this.wallet */
  recipient?: PublicKey;
  /** Payer for this transaction, and holder of the HNT. **Default** this.wallet */
  owner?: PublicKey;
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

  async mintDataCreditsInstructions({
    amount,
    owner = this.wallet.publicKey,
    recipient = this.wallet.publicKey,
  }: IMintDataCreditsArgs) {
    const [dataCredits] = await DataCreditsSdk.dataCreditsKey();
    const dataCreditsAcc = await this.getDataCredits(dataCredits);
    if (!dataCreditsAcc) throw new Error("Data credits not available at the expected address.")
    const hntMintAcc = await getMint(
      this.provider.connection,
      dataCreditsAcc!.hntMint
    );
    const [tokenAuthority, authBump] = await DataCreditsSdk.tokenAuthorityKey();

    const burner = await getAssociatedTokenAddress(dataCreditsAcc.hntMint, owner);
    const recipientAcc = await getAssociatedTokenAddress(dataCreditsAcc.dcMint, recipient);

    const instructions: TransactionInstruction[] = [];

    if (!(await this.provider.connection.getAccountInfo(recipientAcc))) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          owner,
          recipientAcc,
          owner,
          dataCreditsAcc.dcMint
        )
      );
    }
    instructions.push(await this.program.methods.mintDataCreditsV0({authBump, amount: toBN(amount, hntMintAcc)}).accounts({
      burner,
      recipient: recipientAcc,
      tokenAuthority,
      hntMint: dataCreditsAcc.hntMint,
      dcMint: dataCreditsAcc.dcMint,
    }).instruction());

    return {
      signers: [],
      instructions,
      output: {
        dataCredits,
      },
    };
  }

  async mintDataCredits(
    args: IMintDataCreditsArgs,
    commitment: Commitment = "confirmed"
  ) {
    return this.execute(
      await this.mintDataCreditsInstructions(args),
      args.owner,
      commitment
    );
  }
}
