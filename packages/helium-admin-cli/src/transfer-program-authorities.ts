import * as anchor from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import Squads from '@sqds/sdk';
import os from 'os';
import yargs from 'yargs/yargs';
import {
  createProgramSetAuthorityInstruction,
  createSetIdlAuthorityInstruction,
  loadKeypair,
  sendInstructionsOrSquads
} from './utils';

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
    executeTransaction: {
      type: 'boolean',
    },
    multisig: {
      type: 'string',
      describe:
        'Address of the squads multisig to be authority. If not provided, your wallet will be the authority',
    },
    authorityIndex: {
      type: 'number',
      describe: 'Authority index for squads. Defaults to 1',
      default: 1,
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
  const squads = Squads.endpoint(process.env.ANCHOR_PROVIDER_URL, wallet, {
    commitmentOrConfig: 'finalized',
  });
  let authority = provider.wallet.publicKey;
  let multisig = argv.multisig ? new PublicKey(argv.multisig) : null;
  if (multisig) {
    authority = squads.getAuthorityPDA(multisig, argv.authorityIndex);
  }
  console.log(authority.toBase58());
  await sendInstructionsOrSquads({
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
    executeTransaction: argv.executeTransaction,
    squads,
    multisig: argv.multisig ? new PublicKey(argv.multisig) : undefined,
    authorityIndex: argv.authorityIndex,
    signers: [],
  });
}
