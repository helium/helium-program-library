import * as anchor from '@coral-xyz/anchor';
import {
  delegatedDataCreditsKey,
  init as initDc,
} from '@helium/data-credits-sdk';
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { BN } from 'bn.js';
import os from 'os';
import yargs from 'yargs/yargs';
import { loadKeypair, sendInstructionsOrSquadsV4 } from './utils';
import { subDaoKey, init as initHsd } from '@helium/helium-sub-daos-sdk';

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
    sourceDntMint: {
      type: 'string',
      required: true,
    },
    destinationDntMint: {
      type: 'string',
      required: true,
    },
    routerKey: {
      type: 'string',
      required: true,
    },
    amount: {
      type: 'number',
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
  const program = await initDc(provider);
  const hsdProgram = await initHsd(provider);

  const instructions: TransactionInstruction[] = [];

  const sourceSubDao = subDaoKey(new PublicKey(argv.sourceDntMint))[0];
  const destinationSubDao = subDaoKey(
    new PublicKey(argv.destinationDntMint)
  )[0];
  const sourceDelegatedDataCredits = delegatedDataCreditsKey(
    sourceSubDao,
    argv.routerKey
  )[0];
  const destinationDelegatedDataCredits = delegatedDataCreditsKey(
    destinationSubDao,
    argv.routerKey
  )[0];

  const subdao = await hsdProgram.account.subDaoV0.fetch(sourceSubDao);
  const dao = await hsdProgram.account.daoV0.fetch(subdao.dao);
  const authority = dao.authority;

  const method = await program.methods
    .changeDelegatedSubDaoV0({
      amount: new BN(argv.amount),
      routerKey: argv.routerKey,
    })
    .accountsPartial({
      delegatedDataCredits: sourceDelegatedDataCredits,
      destinationDelegatedDataCredits,
      subDao: sourceSubDao,
      destinationSubDao,
      authority,
    });

  const { destinationEscrowAccount } = await method.pubkeys();
  console.log(
    sourceDelegatedDataCredits.toString(),
    destinationDelegatedDataCredits.toString()
  );
  instructions.push(await method.instruction());

  await sendInstructionsOrSquadsV4({
    provider,
    instructions,
    multisig: argv.multisig ? new PublicKey(argv.multisig) : undefined,
    signers: [],
  });
}
