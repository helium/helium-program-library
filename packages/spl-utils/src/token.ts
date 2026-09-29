import * as anchor from "@anchor-lang/core";
import {
  createAssociatedTokenAccountInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  ConfirmOptions,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { sendInstructions } from "./transaction";

export async function mintTo(
  provider: anchor.AnchorProvider,
  mint: PublicKey,
  amount: number | bigint,
  destination: PublicKey
): Promise<void> {
  try {
    await sendInstructions(provider, [
      createMintToInstruction(
        mint,
        destination,
        provider.wallet.publicKey,
        amount
      ),
    ]);
  } catch (e: any) {
    console.log("Error", e, e.logs);
    if (e.logs) {
      console.error(e.logs.join("\n"));
    }
    throw e;
  }
}

export async function createAtaAndTransferInstructions(
  provider: anchor.AnchorProvider,
  mint: PublicKey,
  amount: number | anchor.BN,
  from: PublicKey = provider.wallet.publicKey,
  to: PublicKey = provider.wallet.publicKey,
  payer: PublicKey = provider.wallet.publicKey
): Promise<{ instructions: TransactionInstruction[]; toAta: PublicKey }> {
  const toAta = await getAssociatedTokenAddress(mint, to, true);
  const instructions: TransactionInstruction[] = [];
  if (!(await provider.connection.getAccountInfo(toAta))) {
    instructions.push(
      createAssociatedTokenAccountInstruction(payer, toAta, to, mint)
    );
  }
  const fromAta = await getAssociatedTokenAddress(mint, from, true);
  if (amount != 0) {
    instructions.push(
      createTransferInstruction(fromAta, toAta, from, BigInt(amount.toString()))
    );
  }

  return {
    instructions,
    toAta,
  };
}

export async function createAtaAndTransfer(
  provider: anchor.AnchorProvider,
  mint: PublicKey,
  amount: number | anchor.BN,
  from: PublicKey = provider.wallet.publicKey,
  to: PublicKey = provider.wallet.publicKey,
  authority: PublicKey = provider.wallet.publicKey,
  payer: PublicKey = provider.wallet.publicKey,
  confirmOptions?: ConfirmOptions
): Promise<PublicKey> {
  const { instructions, toAta } = await createAtaAndTransferInstructions(
    provider,
    mint,
    amount,
    from,
    to,
    payer
  );
  try {
    await sendInstructions(
      provider,
      instructions,
      [],
      undefined,
      confirmOptions?.commitment
    );
  } catch (e: any) {
    console.log("Error", e, e.logs);
    if (e.logs) {
      console.error(e.logs.join("\n"));
    }
    throw e;
  }
  return toAta;
}
export async function createAtaAndMintInstructions(
  provider: anchor.AnchorProvider,
  mint: PublicKey,
  amount: number | anchor.BN,
  to: PublicKey = provider.wallet.publicKey,
  authority: PublicKey = provider.wallet.publicKey,
  payer: PublicKey = provider.wallet.publicKey
): Promise<{ instructions: TransactionInstruction[]; ata: PublicKey }> {
  const ata = await getAssociatedTokenAddress(mint, to, true);
  const instructions: TransactionInstruction[] = [];
  if (!(await provider.connection.getAccountInfo(ata))) {
    instructions.push(
      createAssociatedTokenAccountInstruction(payer, ata, to, mint)
    );
  }

  if (amount != 0) {
    instructions.push(
      createMintToInstruction(mint, ata, authority, BigInt(amount.toString()))
    );
  }

  return {
    instructions,
    ata,
  };
}

export async function createAtaAndMint(
  provider: anchor.AnchorProvider,
  mint: PublicKey,
  amount: number | anchor.BN,
  to: PublicKey = provider.wallet.publicKey,
  authority: PublicKey = provider.wallet.publicKey,
  payer: PublicKey = provider.wallet.publicKey,
  confirmOptions?: ConfirmOptions
): Promise<PublicKey> {
  const { instructions, ata } = await createAtaAndMintInstructions(
    provider,
    mint,
    amount,
    to,
    authority,
    payer
  );
  try {
    await sendInstructions(
      provider,
      instructions,
      [],
      undefined,
      confirmOptions?.commitment
    );
  } catch (e: any) {
    console.log("Error", e, e.logs);
    if (e.logs) {
      console.error(e.logs.join("\n"));
    }
    throw e;
  }
  return ata;
}

export async function createMintInstructions(
  provider: anchor.AnchorProvider,
  decimals: number,
  mintAuthority: PublicKey,
  freezeAuthority: PublicKey | null = null,
  mintKeypair: Keypair = Keypair.generate()
): Promise<TransactionInstruction[]> {
  const mintKey = mintKeypair.publicKey;
  return [
    SystemProgram.createAccount({
      fromPubkey: provider.wallet.publicKey,
      newAccountPubkey: mintKey,
      space: 82,
      lamports: await provider.connection.getMinimumBalanceForRentExemption(82),
      programId: TOKEN_PROGRAM_ID,
    }),
    await createInitializeMintInstruction(
      mintKeypair.publicKey,
      decimals,
      mintAuthority,
      freezeAuthority
    ),
  ];
}

export async function createMint(
  provider: anchor.AnchorProvider,
  decimals: number,
  mintAuthority: PublicKey,
  freezeAuthority: PublicKey | null = null,
  mintKeypair: Keypair = Keypair.generate()
): Promise<PublicKey> {
  const instructions = await createMintInstructions(
    provider,
    decimals,
    mintAuthority,
    freezeAuthority,
    mintKeypair
  );

  try {
    await sendInstructions(provider, instructions, [mintKeypair]);
  } catch (e: any) {
    console.log("Error", e, e.logs);
    if (e.logs) {
      console.error(e.logs.join("\n"));
    }
    throw e;
  }

  return mintKeypair.publicKey;
}
