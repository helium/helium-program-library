import * as anchor from '@coral-xyz/anchor';
import { init as initHem } from '@helium/helium-entity-manager-sdk';
import { daoKey, init as initHsd } from '@helium/helium-sub-daos-sdk';
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import os from 'os';
import yargs from 'yargs/yargs';
import { loadKeypair, sendInstructionsOrSquadsV4 } from './utils';
import { HNT_MINT } from '@helium/spl-utils';

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
    hntMint: {
      type: 'string',
      describe: 'HNT mint of the dao to be updated',
      default: HNT_MINT.toBase58(),
    },
    programId: {
      type: 'string',
      describe: 'Program ID to allow',
      required: true,
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
  const program = await initHem(provider);
  const hsdProgram = await initHsd(provider);
  const programId = new PublicKey(argv.programId);

  const instructions: TransactionInstruction[] = [];

  const hntMint = new PublicKey(argv.hntMint);
  const dao = daoKey(hntMint)[0];
  const authority = (await hsdProgram.account.daoV0.fetch(dao)).authority;

  instructions.push(
    await program.methods
      .approveProgramV0({
        programId,
      })
      .accountsPartial({
        dao,
        authority,
        payer: authority,
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
