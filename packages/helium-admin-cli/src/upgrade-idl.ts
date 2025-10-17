import * as anchor from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import os from 'os';
import yargs from 'yargs/yargs';
import {
  createCloseBufferInstruction,
  createIdlUpgradeInstruction,
  loadKeypair,
  sendInstructionsOrSquadsV4,
} from './utils';
import { BPF_UPGRADE_LOADER_ID } from '@solana/spl-governance';
import bs58 from 'bs58';
import * as multisig from '@sqds/multisig';

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
    bufferId: {
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
  await sendInstructionsOrSquadsV4({
    provider,
    instructions: [
      await createIdlUpgradeInstruction(
        new PublicKey(argv.programId),
        new PublicKey(argv.bufferId),
        authority
      ),
    ],
    multisig: multisigPda!,
    signers: [],
  });
}
