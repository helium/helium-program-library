import { toBN } from "@helium-foundation/spl-utils";
import { DataCredits } from "@helium-foundation/idls/lib/types/data_credits";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  AnchorProvider,
  Program,
} from "@project-serum/anchor";
import BN from "bn.js";
import {
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
  const [dataCredits] = dataCreditsKey()
  const dataCreditsAcc = await program.account.dataCreditsV0.fetch(dataCredits!);
  if (!dataCreditsAcc) throw new Error("Data credits not available at the expected address.");

  const hntMintAcc = await getMint(
    provider.connection,
    dataCreditsAcc!.hntMint
  );
  
  const instructions: TransactionInstruction[] = [];
  instructions.push(await program.methods.mintDataCreditsV0({amount: toBN(amount, hntMintAcc)}).accounts({
    owner,
    recipient,
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
  /** The subdao that earns the rewards for burning this DC */
  subDao: PublicKey;
  /** Payer for this transaction, and holder of the DC to burn. **Default** this.wallet */
  owner?: PublicKey;
}

export async function burnDataCreditsInstructions({
  program,
  provider,
  amount,
  subDao,
  owner = provider.wallet.publicKey,
}: IBurnDataCreditsArgs) {
  const [dataCredits] = dataCreditsKey()
  const dataCreditsAcc = await program.account.dataCreditsV0.fetch(dataCredits!);
  if (!dataCreditsAcc) throw new Error("Data credits not available at the expected address.")
  const dcMintAcc = await getMint(
    provider.connection,
    dataCreditsAcc!.dcMint
  );

  const burner = await getAssociatedTokenAddress(dataCreditsAcc.dcMint, owner);

  const instructions: TransactionInstruction[] = [];
  const method = program.methods.burnDataCreditsV0({amount: toBN(amount, dcMintAcc)}).accounts({
    burner,
    dcMint: dataCreditsAcc.dcMint,
    //@ts-ignore
    trackerAccounts: {
      subDao,
    },
  })

  const {
    // @ts-ignore
    trackerAccounts: { subDaoEpochInfo },
  } = await method.pubkeys();

  instructions.push(await method.instruction());

  return {
    signers: [],
    instructions,
    output: {
      dataCredits,
      subDaoEpochInfo
    },
  };
}