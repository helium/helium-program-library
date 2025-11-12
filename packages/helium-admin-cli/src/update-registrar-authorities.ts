import * as anchor from '@coral-xyz/anchor';
import { init } from '@helium/voter-stake-registry-sdk';
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
    registrar: {
      type: 'string',
      required: true,
    },
    authority: {
      type: 'string',
      required: true
    },
    multisig: {
      type: 'string',
    },
  });

  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const wallet = new anchor.Wallet(loadKeypair(argv.wallet));
  const vsrProgram = await init(provider);
  const registrar = new PublicKey(argv.registrar);
  const registrarAcc = await vsrProgram.account.registrar.fetch(registrar);
  const instructions = [
    await vsrProgram.methods
      .updateRegistrarAuthorityV0({
        authority: new PublicKey(argv.authority)
      })
      .accountsPartial({
        registrar,
        realmAuthority: registrarAcc.realmAuthority,
      })
      .instruction(),
  ];

  await sendInstructionsOrSquadsV4({
    provider,
    instructions,
    signers: [],
    multisig: argv.multisig ? new PublicKey(argv.multisig) : undefined,
  });
}
