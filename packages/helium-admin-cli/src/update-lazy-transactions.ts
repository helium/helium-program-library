import * as anchor from '@coral-xyz/anchor';
import {
  init as initLazy,
  lazyTransactionsKey,
} from '@helium/lazy-transactions-sdk';
import { PublicKey } from '@solana/web3.js';
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
    multisig: {
      type: 'string',
      describe:
        'Address of the squads multisig to be authority. If not provided, your wallet will be the authority',
    },
    newAuthority: {
      type: 'string',
    },
    name: {
      required: true,
      type: 'string',
    },
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const wallet = new anchor.Wallet(loadKeypair(argv.wallet));
  const lazyTrProgram = await initLazy(provider);
  const [lazyTransactions] = lazyTransactionsKey(argv.name);
  const lazyTrAcc = await lazyTrProgram.account.lazyTransactionsV0.fetch(
    lazyTransactions
  );

  console.log(lazyTransactions.toBase58());
  const ix = await lazyTrProgram.methods
    .updateLazyTransactionsV0({
      authority: argv.newAuthority
        ? new PublicKey(argv.newAuthority)
        : lazyTrAcc.authority,
      root: null,
    })
    .accountsPartial({
      lazyTransactions,
      authority: lazyTrAcc.authority,
      canopy: lazyTrAcc.canopy,
      executedTransactions: lazyTrAcc.executedTransactions,
    })
    .instruction();

  await sendInstructionsOrSquadsV4({
    provider,
    instructions: [ix],
    multisig: argv.multisig ? new PublicKey(argv.multisig) : undefined,
    signers: [],
  });
}
