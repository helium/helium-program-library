import {
  InstructionResult,
  AnchorSdk,
  TypedAccountParser,
} from "@strata-foundation/spl-utils";
import { LazyDistributor } from "../../../target/types/lazy_distributor";
import { PublicKey } from "@solana/web3.js";
import {
  AnchorProvider,
  IdlAccounts,
  IdlTypes,
  Program,
} from "@project-serum/anchor";
import BN from "bn.js";
import { PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";

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
   * The account holding the rewards that are distributed
   */
  rewardsAccount: PublicKey;
  /**
   * The wallet that can make changes to this distributor
   */
  authority: PublicKey;
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
  /** The lazy distributor this recipient is under */
  lazyDistributor: PublicKey;
  /** The mint to be rewarded */
  mint: PublicKey;
  amount: BN | number;
}

export class LazyDistributorSdk extends AnchorSdk<LazyDistributor> {
  static ID = new PublicKey("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

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
  ): Promise<ILazyDistributor> {
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

  async getRecipient(
    recipient: PublicKey
  ): Promise<ILazyDistributor> {
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
    programId: PublicKey = LazyDistributorSdk.ID
  ): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [Buffer.from("lazy-distributor", "utf-8"), collection.toBuffer()],
      programId
    );
  }

  async initializeLazyDistributorInstructions({
    payer = this.wallet.publicKey,
    rewardsAccount,
    authority,
    collection,
    oracles,
  }: IInitializeDistributorArgs): Promise<
    InstructionResult<{ lazyDistributor: PublicKey }>
  > {
    const [lazyDistributor] = await this.lazyDistributorDecoder(
      collection,
      this.program.ID
    );
    const instruction = this.program.method.initializeLazyDistributorV0
      .accounts({
        payer,
        lazyDistributor,
        rewardsAccount,
      })
      .args({
        collection,
        oracles,
        authority,
      });

    return {
      signers: [],
      instructions: [instruction],
      output: {
        lazyDistributor,
      },
    };
  }

  async initializeRecipientInstructions({
    payer = this.wallet.publicKey,
    lazyDistributor,
    mint,
  }: IInitializeRecipientArgs): Promise<
    InstructionResult<{ recipient: PublicKey }>
  > {
    const [recipient] = await this.lazyDistributorDecoder(
      lazyDistributor,
      mint,
      this.program.ID
    );
    const [tragetMetadata] = await PublicKey.findProgramAddress(
      [Buffer.from("metadata", "utf-8"), mint.toBuffer()],
      TOKEN_METADATA_PROGRAM_ID
    );
    const instruction = this.program.method.initializeRecipientV0
      .accounts({
        payer,
        lazyDistributor,
        recipient,
        mint,
        tragetMetadata,
      })
      .args({
        collection,
        oracles,
        authority,
      });

    return {
      signers: [],
      instructions: [instruction],
      output: {
        recipient,
      },
    };
  }

  async setRewardsInstructinos({
    payer = this.wallet.publicKey,
    oracle = this.wallet.publicKey,
    amount,
    lazyDistributor,
  }): Promise<InstructionResult<null>> {
    const [recipient] = await LazyDistributorSdk.recipientKey(
      lazyDistributor,
      this.program.ID
    );
    const distributor = await this.getLazyDistributor(lazyDistributor);
    const mintAccount = await getMintInfo(this.provider, distributor.rewardsMint)

    const instruction = this.program.method.setRewardsV0
      .accounts({
        payer,
        lazyDistributor,
        recipient,
        oracle,
      })
      .args({
        oracleIndex: distributor.oracles.findIndex((oracle) =>
          oracle.oracle.equals(oracle)
        ),
        currentRewards: toBN(amount, mintAccount),
      });
    return {
      instructions: [instruction],
      signers: [],
      output: null,
    };
  }
}
