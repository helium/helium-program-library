import * as anchor from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import * as multisig from "@sqds/multisig";
import os from 'os';
import yargs from 'yargs/yargs';
import {
  loadKeypair,
  sendInstructionsOrSquadsV4
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
    multisig: {
      type: 'string',
      describe:
        'Address of the squads multisig to be authority. If not provided, your wallet will be the authority',
      required: true,
    },
    proposer: {
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
  let authority = provider.wallet.publicKey;
  const multisigPda = new PublicKey(argv.multisig);
  const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(
    provider.connection,
    multisigPda
  );

  // Get the updated transaction index
  const currentTransactionIndex = Number(multisigInfo.transactionIndex);
  const newTransactionIndex = BigInt(currentTransactionIndex + 1);

  const ix = await multisig.instructions.configTransactionCreate({
    rentPayer: wallet.publicKey,
    multisigPda,
    // Replace with current index if needed
    transactionIndex: newTransactionIndex,
    // Member must have at least "Proposer" permissions
    creator: wallet.publicKey,
    actions: [{
      // Type of action
      __kind: "AddMember",
      newMember: {
        key: new PublicKey(argv.proposer),
        permissions: {
          mask: multisig.types.Permission.Initiate
        }
      },
    }],
  });

  await sendInstructionsOrSquadsV4({
    provider,
    payer: wallet.publicKey,
    instructions: [ix],
    multisig: multisigPda,
  })
}
