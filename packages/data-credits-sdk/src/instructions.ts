import { toBN } from "@helium-foundation/spl-utils";
import { DataCredits } from "../../../target/types/data_credits";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  AnchorProvider,
  Program,
} from "@project-serum/anchor";
import BN from "bn.js";
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  getMint,
} from "@solana/spl-token";
import { dataCreditsKey } from "./pdas";

export interface IMintDataCreditsArgs {
  program: Program<DataCredits>;
  provider: AnchorProvider;
  /** Amount of HNT to burn */
  amount: BN | number;
  /** Address to send the DC to. **Default** this.wallet */
  recipient?: PublicKey;
  /** Payer for this transaction, and holder of the HNT. **Default** this.wallet */
  owner?: PublicKey;
}

export async function mintDataCreditsInstructions({
  program,
  provider,
  amount,
  owner = provider.wallet.publicKey,
  recipient = provider.wallet.publicKey,
}: IMintDataCreditsArgs) {
  const [dataCredits] = dataCreditsKey();
  const dataCreditsAcc = await program.account.dataCreditsV0.fetch(dataCredits);
  if (!dataCreditsAcc) throw new Error("Data credits not available at the expected address.");

  const hntMintAcc = await getMint(
    provider.connection,
    dataCreditsAcc!.hntMint
  );

  const burner = await getAssociatedTokenAddress(dataCreditsAcc.hntMint, owner);
  const recipientAcc = await getAssociatedTokenAddress(dataCreditsAcc.dcMint, recipient);
  const instructions: TransactionInstruction[] = [];

  if (!(await provider.connection.getAccountInfo(recipientAcc))) {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        owner,
        recipientAcc,
        owner,
        dataCreditsAcc.dcMint
      )
    );
  }

  instructions.push(await program.methods.mintDataCreditsV0({amount: toBN(amount, hntMintAcc)}).accounts({
    burner,
    recipient: recipientAcc,
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

export interface IBurnDataCreditsArgs {
  program: Program<DataCredits>;
  provider: AnchorProvider;
  /** Amount of HNT to burn */
  amount: BN | number;
  /** Payer for this transaction, and holder of the DC to burn. **Default** this.wallet */
  owner?: PublicKey;
}

export async function burnDataCreditsInstructions({
  program,
  provider,
  amount,
  owner = provider.wallet.publicKey,
}: IBurnDataCreditsArgs) {
  const [dataCredits] = dataCreditsKey();
  const dataCreditsAcc = await program.account.dataCreditsV0.fetch(dataCredits);
  if (!dataCreditsAcc) throw new Error("Data credits not available at the expected address.")
  const dcMintAcc = await getMint(
    provider.connection,
    dataCreditsAcc!.dcMint
  );

  const burner = await getAssociatedTokenAddress(dataCreditsAcc.dcMint, owner);

  const instructions: TransactionInstruction[] = [];

  instructions.push(await program.methods.burnDataCreditsV0({amount: toBN(amount, dcMintAcc)}).accounts({
    burner,
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