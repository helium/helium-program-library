import * as anchor from '@coral-xyz/anchor';
import { dataCreditsKey, init as initDc } from '@helium/data-credits-sdk';
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import os from 'os';
import yargs from 'yargs/yargs';
import {
  loadKeypair,
  sendInstructionsOrCreateProposal,
  sendInstructionsOrSquadsV4,
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
    dcMint: {
      required: true,
      type: 'string',
      describe: 'Data credits mint address',
    },
    newAuthority: {
      type: 'string',
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
  const program = await initDc(provider);

  const instructions: TransactionInstruction[] = [];

  const dataCredits = dataCreditsKey(new PublicKey(argv.dcMint))[0];
  const dataCreditsAcc = await program.account.dataCreditsV0.fetch(dataCredits);
  console.log('Data Credits', dataCredits.toBase58());

  console.log(dataCreditsAcc.authority.toBase58());
  instructions.push(
    await program.methods
      .updateDataCreditsV0({
        newAuthority: argv.newAuthority
          ? new PublicKey(argv.newAuthority)
          : null,
      })
      .accountsPartial({
        dataCredits,
        dcMint: new PublicKey(argv.dcMint),
        authority: dataCreditsAcc.authority,
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

function isNull(vehntDelegated: string | undefined | null) {
  return vehntDelegated === null || typeof vehntDelegated == 'undefined';
}
