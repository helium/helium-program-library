import Address from '@helium/address';
import { ED25519_KEY_TYPE } from '@helium/address/build/KeyTypes';
import {
  init as initHem,
  makerKey,
  rewardableEntityConfigKey,
  makerApprovalKey,
} from '@helium/helium-entity-manager-sdk';
import { init as initHsd, subDaoKey } from '@helium/helium-sub-daos-sdk';
import { init as initVsr } from '@helium/voter-stake-registry-sdk';
import {
  chunks,
  humanReadable,
  sendInstructions,
  truthy,
} from '@helium/spl-utils';
import * as anchor from '@coral-xyz/anchor';
import {
  getConcurrentMerkleTreeAccountSize,
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
} from '@solana/spl-account-compression';
import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import fs from 'fs';
import os from 'os';
import yargs from 'yargs/yargs';
import {
  exists,
  loadKeypair,
  sendInstructionsOrSquadsV4,
  merkleSizes,
} from './utils';
import * as multisig from '@sqds/multisig';

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
    govProgramId: {
      type: 'string',
      describe: 'Pubkey of the GOV program',
      default: 'hgovkRU6Ghe1Qoyb54HdSLdqN7VtxaifBzRmh9jtd3S',
    },
    fromFile: {
      describe: 'Load makers from a json file and create in bulk',
      required: false,
      type: 'string',
    },
    name: {
      alias: 'n',
      type: 'string',
      required: false,
      describe: 'The name of the maker',
    },
    makerKey: {
      alias: 'm',
      type: 'string',
      describe: '*Helium* Public Key of a maker',
      required: false,
    },
    makerCount: {
      alias: 'c',
      type: 'number',
      describe: 'Estimated number of hotspots this maker will have',
      required: false,
    },
    merkleBasePath: {
      type: 'string',
      describe: 'Base path for merkle keypairs',
      default: `${__dirname}/../keypairs`,
    },
    symbol: {
      alias: 's',
      type: 'string',
      required: true,
      describe: 'The symbol of the entity config',
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

  const name = argv.name;
  const symbol = argv.symbol;

  let makers = [
    {
      name,
      address: argv.makerKey,
      count: argv.makerCount || 300000,
      staked: true,
    },
  ];

  if (argv.fromFile) {
    makers = JSON.parse(fs.readFileSync(argv.fromFile, 'utf-8'));
    // Append a special fallthrough maker for hotspots that don't have a maker
    const solAddr = provider.wallet.publicKey;
    const helAddr = new Address(0, 0, ED25519_KEY_TYPE, solAddr.toBuffer());
    makers.push({
      name: 'Migrated Helium Hotspot',
      address: helAddr.b58,
      count: 50000,
      staked: true,
    });
  }

  const hemProgram = await initHem(provider);
  const hsdProgram = await initHsd(provider);
  const vsrProgram = await initVsr(provider);
  const conn = provider.connection;
  const subdaoMint = new PublicKey(argv.subdaoMint);
  const subdao = (await subDaoKey(subdaoMint))[0];
  const entityConfigKey = (
    await rewardableEntityConfigKey(subdao, symbol.toUpperCase())
  )[0];

  const subdaoAcc = await hsdProgram.account.subDaoV0.fetch(subdao);
  const dao = await hsdProgram.account.daoV0.fetch(subdaoAcc.dao);
  let subdaoPayer = provider.wallet.publicKey;
  let daoPayer = provider.wallet.publicKey;
  let authority = provider.wallet.publicKey;
  let multisigPda = argv.multisig ? new PublicKey(argv.multisig) : null;
  if (multisigPda) {
    const [vaultPda] = multisig.getVaultPda({
      multisigPda,
      index: 0,
    });
    authority = vaultPda;
    subdaoPayer = authority;
    daoPayer = authority;
    console.log('SQUAD AUTH', authority.toBase58());
  }

  const createInstructions: TransactionInstruction[][] = [];
  const approveInstructions: TransactionInstruction[][] = [];
  const updateAuthority = dao.authority;
  let totalSol = 0;
  for (const { name, address, count, staked } of makers) {
    const innerCreateInstrs: TransactionInstruction[] = [];
    const makerAuthority = new PublicKey(Address.fromB58(address!).publicKey);
    const [size, buffer, canopy] = merkleSizes.find(
      ([height]) => Math.pow(2, height) > count * 2
    )!;
    const space = getConcurrentMerkleTreeAccountSize(size, buffer, canopy);
    const maker = await makerKey(subdaoAcc.dao, name!)[0];
    const rent = await provider.connection.getMinimumBalanceForRentExemption(
      space
    );
    totalSol += rent;

    let merkle: Keypair;
    const merklePath = `${argv.merkleBasePath}/merkle-${address}.json`;
    if (fs.existsSync(merklePath)) {
      merkle = loadKeypair(merklePath);
    } else {
      merkle = Keypair.generate();
      fs.writeFileSync(
        merklePath,
        JSON.stringify(Array.from(merkle.secretKey))
      );
    }

    if (!(await exists(conn, maker))) {
      console.log(
        `
            Creating maker with helium addr: ${address}.
            Solana addr: ${makerAuthority.toBase58()}.
            Size: ${size}, buffer: ${buffer}, canopy: ${canopy}.
            Space: ${space} bytes
            Cost: ~${humanReadable(new anchor.BN(rent), 9)} Sol
            `
      );

      if (space > 10000000) {
        throw new Error(
          `Space ${space} more than 10mb for tree ${size}, ${buffer}, ${canopy}}`
        );
      }

      const create = await hemProgram.methods
        .initializeMakerV0({
          name: name!,
          metadataUrl: 'todo',
          issuingAuthority: makerAuthority,
          updateAuthority,
        })
        .accountsPartial({
          maker,
          payer: daoPayer,
          dao: subdaoAcc.dao,
        })
        .instruction();

      const setTree = await hemProgram.methods
        .setMakerTreeV0({
          maxDepth: size,
          maxBufferSize: buffer,
        })
        .accountsPartial({
          maker,
          merkleTree: merkle.publicKey,
          payer: daoPayer,
          updateAuthority,
        })
        .instruction();

      if (!(await exists(conn, merkle.publicKey))) {
        await sendInstructions(
          provider,
          [
            SystemProgram.createAccount({
              fromPubkey: provider.wallet.publicKey,
              newAccountPubkey: merkle.publicKey,
              lamports:
                await provider.connection.getMinimumBalanceForRentExemption(
                  space
                ),
              space: space,
              programId: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
            }),
          ],
          [merkle]
        );
      }
      innerCreateInstrs.push(...[create, setTree].filter(truthy));
    } else {
      const makerAcc = await hemProgram.account.makerV0.fetch(maker);
      innerCreateInstrs.push(
        await hemProgram.methods
          .updateMakerV0({
            issuingAuthority: makerAuthority,
            updateAuthority,
          })
          .accountsPartial({ maker, updateAuthority: makerAcc.updateAuthority })
          .instruction()
      );

      if (makerAcc.merkleTree.equals(SystemProgram.programId)) {
        const setTree = await hemProgram.methods
          .setMakerTreeV0({
            maxDepth: size,
            maxBufferSize: buffer,
          })
          .accountsPartial({
            maker,
            merkleTree: merkle.publicKey,
            payer: daoPayer,
            updateAuthority,
          })
          .instruction();
        if (!(await exists(conn, merkle.publicKey))) {
          await sendInstructions(
            provider,
            [
              SystemProgram.createAccount({
                fromPubkey: provider.wallet.publicKey,
                newAccountPubkey: merkle.publicKey,
                lamports:
                  await provider.connection.getMinimumBalanceForRentExemption(
                    space
                  ),
                space: space,
                programId: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
              }),
            ],
            [merkle]
          );
        }
        innerCreateInstrs.push(setTree);
      }
    }
    createInstructions.push(innerCreateInstrs);

    const innerApproveInstrs: TransactionInstruction[] = [];
    let approve: TransactionInstruction;
    if (
      staked &&
      !(await exists(conn, makerApprovalKey(entityConfigKey, maker)[0]))
    ) {
      const authority = (
        await hemProgram.account.rewardableEntityConfigV0.fetch(entityConfigKey)
      ).authority;
      approve = await hemProgram.methods
        .approveMakerV0()
        .accountsPartial({
          maker,
          rewardableEntityConfig: entityConfigKey,
          authority,
          payer: subdaoPayer,
        })
        .instruction();
      innerApproveInstrs.push(approve);
    }

    approveInstructions.push(innerApproveInstrs);
  }

  console.log('Total sol needed: ', humanReadable(new anchor.BN(totalSol), 9));

  if (multisigPda) {
    // Approve instructions must execute after ALL create instructions
    const instrs = createInstructions.flat().filter(truthy);
    const approveInstrs = approveInstructions.flat().filter(truthy);
    for (const chunk of chunks([...instrs, ...approveInstrs], 3)) {
      await sendInstructionsOrSquadsV4({
        provider,
        instructions: chunk,
        signers: [],
        multisig: multisigPda,
      });
    }
  } else {
    for (const instrs of [...createInstructions, ...approveInstructions]) {
      await sendInstructions(provider, instrs, []);
    }
  }
}
