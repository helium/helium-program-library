import * as anchor from '@coral-xyz/anchor';
import {
  init as initHem,
  dataOnlyConfigKey,
} from '@helium/helium-entity-manager-sdk';
import { HNT_MINT, sendInstructions } from '@helium/spl-utils';
import { daoKey } from '@helium/helium-sub-daos-sdk';
import * as multisig from '@sqds/multisig';
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from '@solana/web3.js';
import os from 'os';
import yargs from 'yargs/yargs';
import { loadKeypair, sendInstructionsOrSquadsV4 } from './utils';
import fs from 'fs';
import { BN } from 'bn.js';
import {
  getConcurrentMerkleTreeAccountSize,
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
} from '@solana/spl-account-compression';

async function exists(
  connection: Connection,
  account: PublicKey
): Promise<boolean> {
  return Boolean(await connection.getAccountInfo(account));
}

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
      describe: 'HNT token mint',
      default: HNT_MINT.toString(),
    },
    multisig: {
      type: 'string',
      describe:
        'Address of the squads multisig to control the dao. If not provided, your wallet will be the authority',
    },
    merklePath: {
      type: 'string',
      describe: 'Path to the merkle keypair',
      default: `${__dirname}/../../keypairs/data-only-merkle.json`,
    },
  });

  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const wallet = new anchor.Wallet(loadKeypair(argv.wallet));
  const hemProgram = await initHem(provider);

  const hntMint = new PublicKey(argv.hntMint);
  const dao = daoKey(hntMint)[0];

  let authority = provider.wallet.publicKey;
  let multisigPda = argv.multisig ? new PublicKey(argv.multisig) : null;
  if (multisigPda) {
    const [vaultPda] = multisig.getVaultPda({
      multisigPda,
      index: 0,
    });
    authority = vaultPda;
    // Fund authority
    const authAcc = await provider.connection.getAccountInfo(authority);
    if (!authAcc || authAcc.lamports < LAMPORTS_PER_SOL) {
      console.log('Funding multisig...');
      await sendInstructions(provider, [
        SystemProgram.transfer({
          fromPubkey: provider.wallet.publicKey,
          toPubkey: authority,
          lamports: LAMPORTS_PER_SOL,
        }),
      ]);
    }
  }
  if (await exists(provider.connection, dataOnlyConfigKey(dao)[0])) {
    console.log('DataOnly Config already exists');
    return;
  }
  console.log(`Initializing DataOnly Config`);
  let merkle: Keypair;
  if (fs.existsSync(argv.merklePath)) {
    merkle = loadKeypair(argv.merklePath);
  } else {
    merkle = Keypair.generate();
    fs.writeFileSync(
      argv.merklePath,
      JSON.stringify(Array.from(merkle.secretKey))
    );
  }
  const [size, buffer, canopy] = [14, 64, 11];
  const space = getConcurrentMerkleTreeAccountSize(size, buffer, canopy);
  const cost = await provider.connection.getMinimumBalanceForRentExemption(
    space
  );
  if (!(await exists(provider.connection, merkle.publicKey))) {
    await sendInstructions(
      provider,
      [
        SystemProgram.createAccount({
          fromPubkey: provider.wallet.publicKey,
          newAccountPubkey: merkle.publicKey,
          lamports: cost,
          space: space,
          programId: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
        }),
      ],
      [merkle]
    );
  }
  await sendInstructionsOrSquadsV4({
    provider,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
      await hemProgram.methods
        .initializeDataOnlyV0({
          authority,
          newTreeDepth: size,
          newTreeBufferSize: buffer,
          newTreeSpace: new BN(
            getConcurrentMerkleTreeAccountSize(size, buffer, canopy)
          ),
          newTreeFeeLamports: new BN(cost / 2 ** size),
          name: 'DATAONLY',
          metadataUrl:
            'https://shdw-drive.genesysgo.net/H8b1gZmA2aBqDYxicxawGpznCaNbFSEJ3YnJuawGQ2EQ/data-only.json',
        })
        .accountsPartial({
          dao,
          authority,
          merkleTree: merkle.publicKey,
        })
        .instruction(),
    ],
    multisig: multisigPda!,
    signers: [],
  });
}
