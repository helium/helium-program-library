import * as anchor from '@coral-xyz/anchor';
import {} from '@helium/helium-entity-manager-sdk';
import {
  init as initLazy,
  lazyDistributorKey,
} from '@helium/lazy-distributor-sdk';
import { PublicKey } from '@solana/web3.js';
import Squads from '@sqds/sdk';
import os from 'os';
import yargs from 'yargs/yargs';
import { loadKeypair, sendInstructionsOrSquads } from './utils';

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
    subdaoMint: {
      required: true,
      describe: 'Public Key of the subdao mint',
      type: 'string',
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
    oracle: {
      type: 'string',
      describe: 'Pubkey of the oracle',
    },
    rewardsOracleUrl: {
      alias: 'ro',
      type: 'string',
      describe: 'The rewards oracle URL',
    },
    newAuthority: {
      type: 'string',
    },
    newApprover: {
      type: 'string',
      description: 'Pubkey of the approver pda',
    },
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const wallet = new anchor.Wallet(loadKeypair(argv.wallet));
  const lazyDistProgram = await initLazy(provider);
  const subdaoMint = new PublicKey(argv.subdaoMint);
  const [lazyDist] = lazyDistributorKey(subdaoMint);
  const lazyDistAcc = await lazyDistProgram.account.lazyDistributorV0.fetch(
    lazyDist
  );
  const squads = Squads.endpoint(process.env.ANCHOR_PROVIDER_URL, wallet, {
    commitmentOrConfig: 'finalized',
  });

  const ix = await lazyDistProgram.methods
    .updateLazyDistributorV0({
      authority: argv.newAuthority
        ? new PublicKey(argv.newAuthority)
        : lazyDistAcc.authority,
      oracles:
        argv.oracle && argv.rewardsOracleUrl
          ? [
              {
                oracle: new PublicKey(argv.oracle),
                url: argv.rewardsOracleUrl,
              },
            ]
          : null,
      approver: argv.newApprover ? new PublicKey(argv.newApprover) : null,
    })
    .accounts({
      rewardsMint: subdaoMint,
      authority: lazyDistAcc.authority,
    })
    .instruction();

  await sendInstructionsOrSquads({
    provider,
    instructions: [ix],
    executeTransaction: argv.executeTransaction,
    squads,
    multisig: argv.multisig ? new PublicKey(argv.multisig) : undefined,
    authorityIndex: argv.authorityIndex,
    signers: [],
  });
}
