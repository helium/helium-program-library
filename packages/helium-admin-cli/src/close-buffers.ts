import * as anchor from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import os from 'os';
import yargs from 'yargs/yargs';
import {
  createCloseBufferInstruction,
  loadKeypair,
  sendInstructionsOrSquadsV4,
} from './utils';
import { BPF_UPGRADE_LOADER_ID } from '@solana/spl-governance';
import bs58 from 'bs58';

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
    multisig: {
      type: 'string',
      describe:
        'Address of the squads multisig to be authority. If not provided, your wallet will be the authority',
    },
    programId: {
      type: 'string',
      required: true,
    },
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const wallet = new anchor.Wallet(loadKeypair(argv.wallet));
  const connection = provider.connection;
  let authority = provider.wallet.publicKey;
  let multisigPda = argv.multisig ? new PublicKey(argv.multisig) : null;
  if (multisigPda) {
    const [vaultPda] = multisig.getVaultPda({
      multisigPda,
      index: 0,
    });
    authority = vaultPda;
  }
  console.log(authority.toBase58());
  const buffers = (
    await connection.getProgramAccounts(BPF_UPGRADE_LOADER_ID, {
      dataSlice: {
        length: 0,
        offset: 0,
      },
      filters: [
        {
          memcmp: {
            offset: 0,
            bytes: bs58.encode(Buffer.from(new Uint8Array([1, 0, 0, 0]))),
          },
        },
        {
          memcmp: {
            offset: 4,
            bytes: bs58.encode(Buffer.from(new Uint8Array([1]))),
          },
        },
        {
          memcmp: {
            offset: 5,
            bytes: bs58.encode(new PublicKey(authority).toBuffer()),
          },
        },
      ],
    })
  ).map((b) => b.pubkey);
  const instructions = await Promise.all(
    buffers.map((b) =>
      createCloseBufferInstruction(
        new PublicKey(argv.programId),
        b,
        authority,
        provider.wallet.publicKey
      )
    )
  );
  await sendInstructionsOrSquadsV4({
    provider,
    instructions,
    multisig: multisigPda!,
    signers: [],
  });
}
