import * as anchor from '@coral-xyz/anchor';
import { sendAndConfirmWithRetry } from '@helium/spl-utils';
import { Transaction } from '@solana/web3.js';
import axios from 'axios';
import os from 'os';
import yargs from 'yargs/yargs';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function run(args: any = process.argv) {
  const argv = await yargs(args).options({
    wallet: {
      alias: 'k',
      describe: 'Anchor wallet keypair',
      default: `${os.homedir()}/.config/solana/id.json`,
    },
    url: {
      alias: 'u',
      describe: 'The solana url',
      default: 'http://127.0.0.1:8899',
    },
    onboardingUrl: {
      alias: 'o',
      describe: 'The onboarding server url',
      default: 'http://127.0.0.1:3002',
    },
    network: {
      alias: 'n',
      describe: 'The network to onboard to [IOT, MOBILE]',
      required: true,
    },
    entityKey: {
      type: 'string',
      describe: 'The entity key to onboard',
      required: true,
    },
  }).argv;

  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const onboardingUrl = argv.onboardingUrl;

  if (!['IOT', 'MOBILE'].includes(argv.network as string)) {
    throw new Error('--network must be IOT or MOBILE');
  }

  const network = (argv.network! as string).toLocaleLowerCase();
  const entityKey = argv.entityKey;

  let tries = 0;
  let onboardResult: any;

  while (tries < 10 && !onboardResult) {
    try {
      onboardResult = await axios.post(
        `${onboardingUrl}/api/v3/transactions/${network}/onboard`,
        {
          entityKey,
        }
      );
    } catch (e) {
      console.log(e.response.data);
      console.log(`Hotspot may not exist yet ${tries}`);
      tries++;
      await sleep(2000); // Wait for hotspot to be indexed into asset api
    }
  }

  for (const solanaTransaction of onboardResult!.data.data.solanaTransactions) {
    const tx = Transaction.from(Buffer.from(solanaTransaction));
    const signed = await provider.wallet.signTransaction(tx);
    const txid = await sendAndConfirmWithRetry(
      provider.connection,
      signed.serialize(),
      { skipPreflight: true },
      'confirmed'
    );
    console.log(txid.txid);
  }
}
