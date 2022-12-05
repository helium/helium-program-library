import {
  createAtaAndMintInstructions,
  createMintInstructions,
  sendInstructions,
  toBN
} from "@helium/spl-utils";
import {
  createCreateMetadataAccountV3Instruction,
  PROGRAM_ID as METADATA_PROGRAM_ID
} from "@metaplex-foundation/mpl-token-metadata";
import * as anchor from "@project-serum/anchor";
import {
  Connection,
  Keypair,
  PublicKey
} from "@solana/web3.js";
import fs from "fs";
import fetch from "node-fetch";

export async function exists(
  connection: Connection,
  account: PublicKey
): Promise<boolean> {
  return Boolean(await connection.getAccountInfo(account));
}

export async function createAndMint({
  provider,
  mintKeypair = Keypair.generate(),
  amount,
  metadataUrl,
  decimals = 8,
}: {
  provider: anchor.AnchorProvider;
  mintKeypair?: Keypair;
  amount: number;
  metadataUrl: string;
  decimals?: number;
}): Promise<void> {
  const metadata = await fetch(metadataUrl).then((r) => r.json());

  if (!(await exists(provider.connection, mintKeypair.publicKey))) {
    console.log(`${metadata.name} Mint not found, creating...`);
    await sendInstructions(
      provider,
      [
        ...(await createMintInstructions(
          provider,
          decimals,
          provider.wallet.publicKey,
          provider.wallet.publicKey,
          mintKeypair
        )),
        ...(
          await createAtaAndMintInstructions(
            provider,
            mintKeypair.publicKey,
            toBN(amount, decimals)
          )
        ).instructions,
      ],
      [mintKeypair]
    );
  }

  const metadataAddress = (
    await PublicKey.findProgramAddress(
      [
        Buffer.from("metadata", "utf-8"),
        METADATA_PROGRAM_ID.toBuffer(),
        mintKeypair.publicKey.toBuffer(),
      ],
      METADATA_PROGRAM_ID
    )
  )[0];

  if (!(await exists(provider.connection, metadataAddress))) {
    console.log(`${metadata.name} Metadata not found, creating...`);
    await sendInstructions(provider, [
      await createCreateMetadataAccountV3Instruction(
        {
          metadata: metadataAddress,
          mint: mintKeypair.publicKey,
          mintAuthority: provider.wallet.publicKey,
          payer: provider.wallet.publicKey,
          updateAuthority: provider.wallet.publicKey,
        },
        {
          createMetadataAccountArgsV3: {
            data: {
              name: metadata.name,
              symbol: metadata.symbol,
              uri: metadataUrl,
              sellerFeeBasisPoints: 0,
              creators: [
                {
                  address: provider.wallet.publicKey,
                  verified: true,
                  share: 100,
                },
              ],
              collection: null,
              uses: null,
            },
            isMutable: true,
            collectionDetails: null,
          },
        }
      ),
    ]);
  }
}

export function loadKeypair(keypair: string): Keypair {
  return Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(keypair).toString()))
  );
}
