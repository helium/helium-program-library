import {
  createCreateMasterEditionV3Instruction,
  createCreateMetadataAccountV3Instruction,
  createVerifyCollectionInstruction,
  PROGRAM_ID as METADATA_PROGRAM_ID,
} from "@metaplex-foundation/mpl-token-metadata";
import * as anchor from "@coral-xyz/anchor";
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
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

export async function mintTo(
  provider: anchor.AnchorProvider,
  mint: PublicKey,
  amount: number | bigint,
  destination: PublicKey
): Promise<void> {
  const mintTx = new Transaction();
  mintTx.add(
    createMintToInstruction(
      mint,
      destination,
      provider.wallet.publicKey,
      amount
    )
  );
  try {
    await provider.sendAndConfirm(mintTx);
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
  const transferIx = new Transaction();
  const { instructions, toAta } = await createAtaAndTransferInstructions(
    provider,
    mint,
    amount,
    from,
    to,
    payer
  );
  if (instructions.length > 0) transferIx.add(...instructions);

  try {
    if (instructions.length > 0)
      await provider.sendAndConfirm(transferIx, undefined, { skipPreflight: true, ...confirmOptions });
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
  const mintTx = new Transaction();
  const { instructions, ata } = await createAtaAndMintInstructions(
    provider,
    mint,
    amount,
    to,
    authority,
    payer
  );
  if (instructions.length > 0) mintTx.add(...instructions);

  try {
    if (instructions.length > 0)
      await provider.sendAndConfirm(mintTx, undefined, confirmOptions);
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
  const tx = new Transaction();
  tx.add(
    ...(await createMintInstructions(
      provider,
      decimals,
      mintAuthority,
      freezeAuthority,
      mintKeypair
    ))
  );

  try {
    await provider.sendAndConfirm(tx, [mintKeypair]);
  } catch (e: any) {
    console.log("Error", e, e.logs);
    if (e.logs) {
      console.error(e.logs.join("\n"));
    }
    throw e;
  }

  return mintKeypair.publicKey;
}

export async function createNft(
  provider: anchor.AnchorProvider,
  recipient: PublicKey,
  data: any = {},
  collectionKey?: PublicKey,
  mintKeypair: Keypair = Keypair.generate(),
  holderKey: PublicKey = provider.wallet.publicKey
): Promise<{ mintKey: PublicKey; collectionKey: PublicKey | undefined }> {
  const mintKey = mintKeypair.publicKey;

  const instructions = await createMintInstructions(
    provider,
    0,
    provider.wallet.publicKey,
    provider.wallet.publicKey,
    mintKeypair
  );
  const [metadata] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata", "utf8"),
      METADATA_PROGRAM_ID.toBuffer(),
      mintKey.toBuffer(),
    ],
    METADATA_PROGRAM_ID
  );
  instructions.push(
    await createCreateMetadataAccountV3Instruction(
      {
        metadata,
        mint: mintKey,
        mintAuthority: provider.wallet.publicKey,
        payer: provider.wallet.publicKey,
        updateAuthority: provider.wallet.publicKey,
      },
      {
        createMetadataAccountArgsV3: {
          data: {
            name: "test",
            symbol: "TST",
            uri: "https://shdw-drive.genesysgo.net/6tcnBSybPG7piEDShBcrVtYJDPSvGrDbVvXmXKpzBvWP/dc.json",
            sellerFeeBasisPoints: 10,
            creators: [
              {
                address: holderKey,
                verified: true,
                share: 100,
              },
            ],
            collection: collectionKey
              ? { key: collectionKey, verified: false }
              : null,
            uses: null,
            ...data,
          },
          isMutable: true,
          collectionDetails: null,
        },
      }
    )
  );

  const { instructions: mintInstrs } = await createAtaAndMintInstructions(
    provider,
    mintKeypair.publicKey,
    1,
    recipient
  );
  instructions.push(...mintInstrs);

  if (collectionKey) {
    const [collectionMetadataAccount] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata", "utf8"),
        METADATA_PROGRAM_ID.toBuffer(),
        collectionKey.toBuffer(),
      ],
      METADATA_PROGRAM_ID
    );
    const [collectionMasterEdition] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata", "utf8"),
        METADATA_PROGRAM_ID.toBuffer(),
        collectionKey.toBuffer(),
        Buffer.from("edition", "utf8"),
      ],
      METADATA_PROGRAM_ID
    );
    const instruction = createVerifyCollectionInstruction({
      metadata: metadata,
      collectionAuthority: provider.wallet.publicKey,
      payer: provider.wallet.publicKey,
      collectionMint: collectionKey,
      collection: collectionMetadataAccount,
      collectionMasterEditionAccount: collectionMasterEdition,
    });
    instructions.push(instruction);
  }

  const [edition] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata", "utf8"),
      METADATA_PROGRAM_ID.toBuffer(),
      mintKey.toBuffer(),
      Buffer.from("edition", "utf8"),
    ],
    METADATA_PROGRAM_ID
  );
  instructions.push(
    createCreateMasterEditionV3Instruction(
      {
        edition,
        mint: mintKey,
        updateAuthority: provider.wallet.publicKey,
        mintAuthority: provider.wallet.publicKey,
        payer: provider.wallet.publicKey,
        metadata,
      },
      {
        createMasterEditionArgs: {
          maxSupply: 0,
        },
      }
    )
  );

  const tx = new Transaction();
  tx.add(...instructions);

  try {
    await provider.sendAndConfirm(tx, [mintKeypair]);
  } catch (e: any) {
    console.log("Error", e, e.logs);
    if (e.logs) {
      console.error(e.logs.join("\n"));
    }
    throw e;
  }

  return {
    mintKey,
    collectionKey,
  };
}
