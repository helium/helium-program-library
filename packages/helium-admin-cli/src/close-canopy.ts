import * as anchor from '@coral-xyz/anchor';
import { daoKey, init as initHsd } from '@helium/helium-sub-daos-sdk';
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import os from 'os';
import yargs from 'yargs/yargs';
import {
  loadKeypair,
  parseEmissionsSchedule,
  sendInstructionsOrSquadsV4,
} from './utils';
import { init, lazyTransactionsKey } from '@helium/lazy-transactions-sdk';

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
    name: {
      required: true,
      type: 'string',
      describe: 'Lazy dist name',
    },
    multisig: {
      type: 'string',
      describe:
        'Address of the squads multisig to be authority. If not provided, your wallet will be the authority',
    },
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const wallet = new anchor.Wallet(loadKeypair(argv.wallet));
  const program = await init(provider);

  const instructions: TransactionInstruction[] = [];

  const lazyTransactions = lazyTransactionsKey(argv.name)[0];
  instructions.push(
    await program.methods
      .closeCanopyV0()
      .accountsPartial({
        lazyTransactions,
        refund: provider.wallet.publicKey,
      })
      .instruction()
  );

  await sendInstructionsOrSquadsV4({
    provider,
    instructions,
    multisig: argv.multisig ? new PublicKey(argv.multisig) : undefined,
    signers: [],
  });
}
