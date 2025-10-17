import * as anchor from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import os from 'os';
import yargs from 'yargs/yargs';
import {
  createProgramSetAuthorityInstruction,
  createSetIdlAuthorityInstruction,
  loadKeypair,
  sendInstructionsOrSquadsV4
} from './utils';
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
    newAuthority: {
      type: 'string',
      required: true,
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
  let authority = provider.wallet.publicKey;
  let multisigPda = argv.multisig ? new PublicKey(argv.multisig) : null;
  if (multisigPda) {
    const [vaultPda] = multisig.getVaultPda({
      multisigPda,
      index: 0,
    });
    authority = vaultPda;
  }
  await sendInstructionsOrSquadsV4({
    provider,
    instructions: [
      await createProgramSetAuthorityInstruction(
        new PublicKey(argv.programId),
        authority,
        new PublicKey(argv.newAuthority),
      ),
      await createSetIdlAuthorityInstruction(
        new PublicKey(argv.programId),
        authority,
        new PublicKey(argv.newAuthority),
      ),
    ],
    multisig: multisigPda!,
    signers: [],
  });
}
