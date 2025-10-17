import * as anchor from '@coral-xyz/anchor';
import { init, organizationKey } from '@helium/organization-sdk';
import {
  init as initLazy,
  lazyDistributorKey,
} from '@helium/lazy-distributor-sdk';
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
    orgName: {
      type: 'string',
      describe: 'The name of the organization',
      required: true,
    },
    multisig: {
      type: 'string',
      describe:
        'Address of the squads multisig to be authority. If not provided, your wallet will be the authority',
    },
    newAuthority: {
      type: 'string',
    },
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const wallet = new anchor.Wallet(loadKeypair(argv.wallet));

  const program = await init(provider);
  const [organizationK] = organizationKey(argv.orgName)
  const organizationAcc = await program.account.organizationV0.fetch(organizationK)

  const ix = await program.methods
    .updateOrganizationV0({
      authority: argv.newAuthority ? new PublicKey(argv.newAuthority) : null,
      defaultProposalConfig: null,
      proposalProgram: null,
      uri: null
    })
    .accountsPartial({
      organization: organizationK,
      authority: organizationAcc.authority,
    })
    .instruction();

  await sendInstructionsOrSquadsV4({
    provider,
    instructions: [ix],
    multisig: argv.multisig ? new PublicKey(argv.multisig) : undefined,
    signers: [],
  });
}
