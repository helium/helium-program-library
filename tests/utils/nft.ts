import * as anchor from "@anchor-lang/core";
import {
  createAtaAndMintInstructions,
  createMintInstructions,
  sendInstructions,
} from "@helium/spl-utils";
import {
  createCreateMasterEditionV3Instruction,
  createCreateMetadataAccountV3Instruction,
  createVerifyCollectionInstruction,
  PROGRAM_ID as METADATA_PROGRAM_ID,
} from "@metaplex-foundation/mpl-token-metadata";
import { Keypair, PublicKey } from "@solana/web3.js";

export async function createNft(
  provider: anchor.AnchorProvider,
  recipient: PublicKey,
  data: any = {},
  collectionKey?: PublicKey,
  mintKeypair: Keypair = Keypair.generate(),
  holderKey: PublicKey = provider.wallet.publicKey,
): Promise<{ mintKey: PublicKey; collectionKey: PublicKey | undefined }> {
  const mintKey = mintKeypair.publicKey;

  const instructions = await createMintInstructions(
    provider,
    0,
    provider.wallet.publicKey,
    provider.wallet.publicKey,
    mintKeypair,
  );
  const [metadata] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata", "utf8"),
      METADATA_PROGRAM_ID.toBuffer(),
      mintKey.toBuffer(),
    ],
    METADATA_PROGRAM_ID,
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
      },
    ),
  );

  const { instructions: mintInstrs } = await createAtaAndMintInstructions(
    provider,
    mintKeypair.publicKey,
    1,
    recipient,
  );
  instructions.push(...mintInstrs);

  if (collectionKey) {
    const [collectionMetadataAccount] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata", "utf8"),
        METADATA_PROGRAM_ID.toBuffer(),
        collectionKey.toBuffer(),
      ],
      METADATA_PROGRAM_ID,
    );
    const [collectionMasterEdition] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata", "utf8"),
        METADATA_PROGRAM_ID.toBuffer(),
        collectionKey.toBuffer(),
        Buffer.from("edition", "utf8"),
      ],
      METADATA_PROGRAM_ID,
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
    METADATA_PROGRAM_ID,
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
      },
    ),
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

  return {
    mintKey,
    collectionKey,
  };
}
