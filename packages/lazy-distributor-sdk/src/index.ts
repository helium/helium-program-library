import {
  InstructionResult,
  AnchorSdk,
  TypedAccountParser,
  toBN,
} from "@helium-foundation/spl-utils";
import { LazyDistributor } from "../../../target/types/lazy_distributor";
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

type LazyDistributorV0 = IdlAccounts<LazyDistributor>["lazyDistributorV0"];
type RecipientV0 = IdlAccounts<LazyDistributor>["recipientV0"];

export interface ILazyDistributor extends LazyDistributorV0 {
  publicKey: PublicKey;
}

export interface IRecipient extends RecipientV0 {
  publicKey: PublicKey;
}

export interface IInitializeDistributorArgs {
  /**
   * The payer for this txn. **Default:** this.wallet
   */
  payer?: PublicKey;
  /**
   * The wallet that can make changes to this distributor. **Default**: this.wallet
   */
  authority?: PublicKey;
  /**
   * The mint that is rewarded
   */
  rewardsMint: PublicKey;
  /**
   * The metaplex collection for the recipient nfts
   */
  collection: PublicKey;
  oracles: { oracle: PublicKey; url: string }[];
}

export interface IInitializeRecipientArgs {
  /**
   * The payer for this txn. **Default:** this.wallet
   */
  payer?: PublicKey;
  /** The lazy distributor this recipient is under */
  lazyDistributor: PublicKey;
  /** The NFT that gets rewarded */
  mint: PublicKey;
}

export interface ISetCurrentRewardsArgs {
  /**
   * The payer for this txn. **Default:** this.wallet
   */
  payer?: PublicKey;
  /** The current oracle, **Default**: this.wallet */
  oracle?: PublicKey;
  recipient: PublicKey;
  amount: BN | number;
}

export class LazyDistributorSdk extends AnchorSdk<LazyDistributor> {
  static ID = new PublicKey("HNLCNtFkjJiCTC9BV7cTCVmQaSx6d6yzp2Pk1A4h2bHt");

  static async init(
    provider: AnchorProvider,
    lazyDistributorProgramId: PublicKey = LazyDistributorSdk.ID
  ): Promise<LazyDistributorSdk> {
    const lazyDistributorIdlJson = await Program.fetchIdl(
      lazyDistributorProgramId,
      provider
    );
    const lazyDistributor = new Program<LazyDistributor>(
      lazyDistributorIdlJson as LazyDistributor,
      lazyDistributorProgramId,
      provider
    ) as Program<LazyDistributor>;

    return new this(provider, lazyDistributor);
  }

  constructor(provider: AnchorProvider, program: Program<LazyDistributor>) {
    super({ provider, program });
  }

  lazyDistributorDecoder: TypedAccountParser<ILazyDistributor> = (
    pubkey,
    account
  ) => {
    const coded = this.program.coder.accounts.decode<LazyDistributorV0>(
      "LazyDistributorV0",
      account.data
    );

    return {
      ...coded,
      publicKey: pubkey,
    };
  };

  async getLazyDistributor(
    lazyDistributor: PublicKey
  ): Promise<ILazyDistributor | null> {
    return this.getAccount(lazyDistributor, this.lazyDistributorDecoder);
  }

  recipientDecoder: TypedAccountParser<IRecipient> = (pubkey, account) => {
    const coded = this.program.coder.accounts.decode<RecipientV0>(
      "RecipientV0",
      account.data
    );

    return {
      ...coded,
      publicKey: pubkey,
    };
  };

  async getRecipient(recipient: PublicKey): Promise<IRecipient | null> {
    return this.getAccount(recipient, this.recipientDecoder);
  }

  static recipientKey(
    lazyDistributor: PublicKey,
    mint: PublicKey,
    programId: PublicKey = LazyDistributorSdk.ID
  ): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [
        Buffer.from("recipient", "utf-8"),
        lazyDistributor.toBuffer(),
        mint.toBuffer(),
      ],
      programId
    );
  }

  static lazyDistributorKey(
    collection: PublicKey,
    mint: PublicKey,
    programId: PublicKey = LazyDistributorSdk.ID
  ): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [
        Buffer.from("lazy-distributor", "utf-8"),
        collection.toBuffer(),
        mint.toBuffer(),
      ],
      programId
    );
  }

  static rewardAccountKey(
    lazyDistributor: PublicKey,
    programId: PublicKey = LazyDistributorSdk.ID
  ): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [
        Buffer.from("lazy-distributor-rewards", "utf-8"),
        lazyDistributor.toBuffer(),
      ],
      programId
    );
  }

  async initializeLazyDistributorInstructions({
    payer = this.wallet.publicKey,
    authority = this.wallet.publicKey,
    rewardsMint,
    collection,
    oracles,
  }: IInitializeDistributorArgs): Promise<
    InstructionResult<{ lazyDistributor: PublicKey }>
  > {
    const [lazyDistributor] = await LazyDistributorSdk.lazyDistributorKey(
      collection,
      rewardsMint,
      this.programId
    );
    const [rewardsAccount] = await LazyDistributorSdk.rewardAccountKey(
      lazyDistributor,
      this.programId
    );
    const instruction = await this.program.methods
      .initializeLazyDistributorV0({
        collection,
        oracles,
        authority,
      })
      .accounts({
        payer,
        lazyDistributor,
        rewardsMint,
        rewardsAccount,
      })
      .instruction();

    return {
      signers: [],
      instructions: [instruction],
      output: {
        lazyDistributor,
      },
    };
  }

  async initializeLazyDistributor(
    args: IInitializeDistributorArgs,
    commitment: Commitment = "confirmed"
  ): Promise<{ lazyDistributor: PublicKey }> {
    return this.execute(
      await this.initializeLazyDistributorInstructions(args),
      args.payer,
      commitment
    );
  }

  async initializeRecipientInstructions({
    payer = this.wallet.publicKey,
    lazyDistributor,
    mint,
  }: IInitializeRecipientArgs): Promise<
    InstructionResult<{ recipient: PublicKey }>
  > {
    const [recipient] = await LazyDistributorSdk.recipientKey(
      lazyDistributor,
      mint,
      this.programId
    );
    const [targetMetadata] = await PublicKey.findProgramAddress(
      [
        Buffer.from("metadata", "utf-8"),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
      ],
      TOKEN_METADATA_PROGRAM_ID
    );
    const instruction = await this.program.methods
      .initializeRecipientV0()
      .accounts({
        payer,
        lazyDistributor,
        recipient,
        mint,
        targetMetadata,
      })
      .instruction();

    return {
      signers: [],
      instructions: [instruction],
      output: {
        recipient,
      },
    };
  }

  async initializeRecipient(
    args: IInitializeRecipientArgs,
    commitment: Commitment = "confirmed"
  ): Promise<{ recipient: PublicKey }> {
    return this.execute(
      await this.initializeRecipientInstructions(args),
      args.payer,
      commitment
    );
  }

  async setCurrentRewardsInstructions({
    payer = this.wallet.publicKey,
    oracle = this.wallet.publicKey,
    amount,
    recipient,
  }: ISetCurrentRewardsArgs): Promise<InstructionResult<null>> {
    const recipientAcc = (await this.getRecipient(recipient!))!;
    const lazyDistributor = recipientAcc.lazyDistributor;

    const distributor = await this.getLazyDistributor(lazyDistributor!);
    const mintAccount = await getMint(
      this.provider.connection,
      distributor!.rewardsMint
    );
    const oracles = distributor?.oracles as { oracle: PublicKey }[];
    const oracleIndex = oracles.findIndex(({ oracle: passed }) =>
      passed.equals(oracle)
    );
    const instruction = await this.program.methods
      .setCurrentRewardsV0({
        oracleIndex,
        currentRewards: toBN(amount, mintAccount),
      })
      .accounts({
        payer,
        lazyDistributor: lazyDistributor!,
        recipient,
        oracle,
      })
      .instruction();
    return {
      instructions: [instruction],
      signers: [],
      output: null,
    };
  }

  async setCurrentRewards(
    args: ISetCurrentRewardsArgs,
    commitment: Commitment = "confirmed"
  ): Promise<null> {
    return this.execute(
      await this.setCurrentRewardsInstructions(args),
      args.payer,
      commitment
    );
  }

  async distributeRewardsInstructions({
    recipient,
    payer = this.wallet.publicKey,
  }: {
    payer?: PublicKey;
    recipient: PublicKey;
  }): Promise<InstructionResult<{ destination: PublicKey; owner: PublicKey }>> {
    const recipientAcc = (await this.getRecipient(recipient!))!;
    const mint = recipientAcc.mint;
    const lazyDistributor = recipientAcc.lazyDistributor;
    const lazyDistributorAcc = (await this.getLazyDistributor(
      recipientAcc.lazyDistributor
    ))!;

    const recipientMintAccount = (
      await this.provider.connection.getTokenLargestAccounts(mint)
    ).value[0].address;
    const recipientMintOwner = (await getAccount(
      this.provider.connection,
      recipientMintAccount
    ))!.owner;
    const destinationAccount = await getAssociatedTokenAddress(
      lazyDistributorAcc.rewardsMint,
      recipientMintOwner
    );

    const instructions: TransactionInstruction[] = [];

    // If ata doesn't exist create it
    if (!(await this.provider.connection.getAccountInfo(destinationAccount))) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          payer,
          destinationAccount,
          recipientMintOwner,
          lazyDistributorAcc.rewardsMint
        )
      );
    }

    instructions.push(
      await this.program.methods
        .distributeRewardsV0()
        .accounts({
          lazyDistributor: lazyDistributor!,
          recipient,
          rewardsAccount: lazyDistributorAcc.rewardsAccount,
          destinationAccount,
          recipientMintAccount,
        })
        .instruction()
    );

    return {
      instructions,
      signers: [],
      output: {
        destination: destinationAccount,
        owner: recipientMintOwner,
      },
    };
  }

  async distributeRewards(
    args: { payer?: PublicKey; recipient: PublicKey },
    commitment: Commitment = "confirmed"
  ): Promise<{ destination: PublicKey; owner: PublicKey }> {
    return this.execute(
      await this.distributeRewardsInstructions(args),
      args.payer,
      commitment
    );
  }
}
