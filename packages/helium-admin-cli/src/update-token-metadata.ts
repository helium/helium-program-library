import * as anchor from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import {
  createUpdateMetadataAccountV2Instruction,
  Metadata,
  PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID
} from '@metaplex-foundation/mpl-token-metadata'
import * as multisig from '@sqds/multisig';
import os from 'os';
import yargs from 'yargs/yargs';
import { loadKeypair, sendInstructionsOrSquadsV4 } from './utils';

export async function run(args: any = process.argv) {
  const yarg = yargs(args).options({
    wallet: {
      alias: 'k',
      describe: 'Anchor wallet keypair',
      default: `${os.homedir()}/.config/solana/id.json`,
    },
    url: {
      alias: 'u',
      default: 'http://127.0.0.1:8899',
      describe: 'The solana url',
    },
    mint: {
      required: true,
      type: 'string',
      describe: 'Token address to update metadata for',
    },
    uri: {
      type: 'string',
      describe: 'The new metadata URI',
    },
    multisig: {
      type: 'string',
      describe:
        'Address of the squads multisig to be authority. If not provided, your wallet will be the authority',
    },
    newAuthority: {
      type: 'string',
      describe: 'New authority for the token',
    },
  });

  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const walletKP = loadKeypair(argv.wallet);
  const wallet = new anchor.Wallet(walletKP);
  let authority = wallet.publicKey;
  let multisigPda = argv.multisig ? new PublicKey(argv.multisig) : null;
  if (multisigPda) {
    const [vaultPda] = multisig.getVaultPda({
      multisigPda,
      index: 0,
    });
    authority = vaultPda;
  }
  try {
    const tokenAddress = new PublicKey(argv.mint);

    // Find the metadata PDA for the token
    const [metadataAddress] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata", "utf-8"),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        tokenAddress.toBuffer(),
      ],
      TOKEN_METADATA_PROGRAM_ID
    );

    // Fetch the existing metadata account
    const metadataAccount = await Metadata.fromAccountAddress(
      provider.connection,
      metadataAddress
    );

    // Create the update instruction
    const updateInstructions = [
      createUpdateMetadataAccountV2Instruction(
        {
          metadata: metadataAddress,
          updateAuthority: authority,
        },
        {
          updateMetadataAccountArgsV2: {
            data: {
              name: metadataAccount.data.name,
              symbol: metadataAccount.data.symbol,
              uri: argv.uri ? argv.uri : metadataAccount.data.uri,
              sellerFeeBasisPoints: metadataAccount.data.sellerFeeBasisPoints,
              creators: metadataAccount.data.creators || null,
              collection: null,
              uses: null
            },
            updateAuthority: argv.newAuthority ? new PublicKey(argv.newAuthority) : metadataAccount.updateAuthority,
            primarySaleHappened: metadataAccount.primarySaleHappened,
            isMutable: metadataAccount.isMutable
          }
        }
      )
    ];

    await sendInstructionsOrSquadsV4({
      provider,
      instructions: updateInstructions,
      multisig: multisigPda!,
      signers: [],
    });

    console.log(`Successfully created transaction to update metadata URI for token ${argv.token} to ${argv.uri}`);
  } catch (err) {
    console.error('Failed to update token metadata:', err);
    process.exit(1);
  }
} 