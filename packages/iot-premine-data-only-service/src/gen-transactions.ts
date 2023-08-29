import * as anchor from '@coral-xyz/anchor';
import Address from '@helium/address';
import { ED25519_KEY_TYPE } from '@helium/address/build/KeyTypes';
import {
  MerkleTree,
  fillCanopy,
  getCanopy,
  getCanopySize,
  init as initLazy,
  lazySignerKey,
  lazyTransactionsKey,
  toLeaf,
} from '@helium/lazy-transactions-sdk';
import { IOT_MINT, chunks, sendInstructions } from '@helium/spl-utils';
import {
  ACCOUNT_SIZE,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import AWS from 'aws-sdk';
import BN from 'bn.js';
import csv from 'csv-parser';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Client as PgClient } from 'pg';
import format from 'pg-format';
import yargs from 'yargs/yargs';
import { EnrichedIxGroup } from './types';
import { decompress, decompressSigners, insertTransactions } from './utils';

const PER_TX = 0.000005;
const IOT_PER_HOTSPOT = new BN(579875535500); // 5798.75535500

const accountSize = (ix: TransactionInstruction): number =>
  ix.keys.length * 33 +
  1 + //  program_id_index
  1 + // accounts len
  1 + // data len
  10; // Extra space just to make sure we fit

const size = (ix: TransactionInstruction): number =>
  ix.data.length + accountSize(ix);

const toSolana = (address: string): PublicKey | undefined => {
  try {
    const addr = Address.fromB58(address);
    if (addr.keyType === ED25519_KEY_TYPE) return new PublicKey(addr.publicKey);
  } catch (e: any) {
    return undefined;
  }
};
const noop = () => {};
const gc = () => {
  if (global.gc) {
    console.log('Garbage collecting...');
    global.gc();
  }
};

(async (args: any = process.argv) => {
  const start = new Date().valueOf();
  const yarg = yargs(args).options({
    wallet: {
      alias: 'k',
      describe: 'Anchor wallet keypair',
      default: `${os.homedir()}/.config/solana/id.json`,
    },
    testing: {
      alias: 't',
      default: true,
      type: 'boolean',
    },
    url: {
      alias: 'u',
      default: 'http://127.0.0.1:8899',
      describe: 'The solana url',
    },
    pgUser: {
      default: 'postgres',
    },
    pgPassword: {
      type: 'string',
    },
    pgDatabase: {
      type: 'string',
    },
    pgHost: {
      default: 'localhost',
    },
    pgPort: {
      default: '5432',
    },
    awsRegion: {
      default: 'us-east-1',
    },
    file: {
      type: 'string',
      alias: 'f',
      describe: 'Ingest file',
      required: true,
    },
    name: {
      type: 'string',
      alias: 'n',
      required: true,
    },
    canopyKeypair: {
      type: 'string',
      describe: 'Optional keypair of the canopy',
      default: `${__dirname}/../keypairs/canopy.json`,
    },
  });

  try {
    const argv = await yarg.argv;
    process.env.ANCHOR_WALLET = argv.wallet;
    process.env.ANCHOR_PROVIDER_URL = argv.url;
    anchor.setProvider(anchor.AnchorProvider.local(argv.url));

    const provider = anchor.getProvider() as anchor.AnchorProvider;
    const connection = provider.connection;
    const lazyTransactionsProgram = await initLazy(provider);
    const iot = IOT_MINT;

    const [lazySigner] = lazySignerKey(argv.name);
    const [lazyTransaction] = lazyTransactionsKey(argv.name);

    const isRds = argv.pgHost.includes('rds.amazonaws.com');
    let password = argv.pgPassword;
    if (isRds && !password) {
      const signer = new AWS.RDS.Signer({
        region: argv.awsRegion,
        hostname: argv.pgHost,
        port: Number(argv.pgPort),
        username: argv.pgUser,
      });
      password = await new Promise((resolve, reject) =>
        signer.getAuthToken({}, (err, token) => {
          if (err) {
            return reject(err);
          }
          resolve(token);
        })
      );
    }

    const db = new PgClient({
      user: argv.pgUser,
      password,
      host: argv.pgHost,
      database: argv.pgDatabase,
      port: Number(argv.pgPort),
      ssl: isRds
        ? {
            rejectUnauthorized: false,
          }
        : false,
    });

    await db.connect();
    console.log('Creating tables...');

    await db.query(`
      CREATE TABLE IF NOT EXISTS canopy (
        id INTEGER PRIMARY KEY NOT NULL,
        bytes bytea NOT NULL
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY NOT NULL,
        compiled bytea NOT NULL,
        signers bytea,
        compute integer NOT NULL
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS transaction_proofs (
        id INTEGER PRIMARY KEY NOT NULL,
        proof jsonb NOT NULL
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS wallet_transactions (
        wallet VARCHAR(66) NOT NULL,
        txid INTEGER NOT NULL
      )
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS wallet_transactions_wallet_idx ON wallet_transactions(wallet);
    `);

    let hotspotsByOwner: { [key: string]: string[] } = {};
    await new Promise((res, rej) => {
      fs.createReadStream(argv.file)
        .pipe(csv())
        .on('data', ({ hotspot, owner }) => {
          const solAddress = toSolana(owner);
          if (solAddress) {
            hotspotsByOwner[solAddress.toBase58()] ||= [];
            hotspotsByOwner[solAddress.toBase58()].push(hotspot);
          } else {
            throw Error(`No sol address for ${owner}`);
          }
        })
        .on('end', res)
        .on('error', (error) => {
          rej(error);
        });
    });

    console.log(
      `${
        Object.values(hotspotsByOwner).filter((x) => x.length > 1).length
      } Owners with multiple hotspots...`
    );

    const ataRent = await connection.getMinimumBalanceForRentExemption(
      ACCOUNT_SIZE
    );
    const totalBalances = {
      // Keep track of balances so we can send that balance to the lazy signer
      iot: new BN(0),
      sol: new BN(0),
    };

    const canopyPath = path.parse(argv.canopyKeypair);
    let canopy;

    if (fs.existsSync(`${canopyPath.dir}/${canopyPath.base}`)) {
      canopy = Keypair.fromSecretKey(
        new Uint8Array(
          JSON.parse(
            fs.readFileSync(`${canopyPath.dir}/${canopyPath.base}`).toString()
          )
        )
      );
    } else {
      canopy = Keypair.generate();

      try {
        fs.mkdirSync(canopyPath.dir);
      } catch (_) {}

      fs.writeFileSync(
        `${canopyPath.dir}/${canopyPath.base}`,
        JSON.stringify(Array.from(canopy.secretKey))
      );
    }

    console.log('Fetching iot atas...');
    let owners = Object.keys(hotspotsByOwner);
    let ataKeys = owners.map((owner) =>
      getAssociatedTokenAddressSync(IOT_MINT, new PublicKey(owner), true)
    );

    let iotAtaInfosByOwner = (
      await Promise.all(
        chunks(ataKeys, 100).map(
          async (chunk) =>
            await connection.getMultipleAccountsInfo(chunk, 'confirmed')
        )
      )
    )
      .flat()
      .reduce(
        (acc, iotAtaInfo, idx) => ({
          ...acc,
          [owners[idx]]: iotAtaInfo,
        }),
        {} as { [key: string]: anchor.web3.AccountInfo<Buffer> | null }
      );

    console.log(
      `${
        Object.values(iotAtaInfosByOwner).filter((x) => !x).length
      } Missing atas... `
    );

    console.log('Creating transfer instructions...');
    const instructions: EnrichedIxGroup[] = [];
    for (const [owner, hotspots] of Object.entries(hotspotsByOwner)) {
      const ixs: TransactionInstruction[] = [];
      const ownerPk = new PublicKey(owner);
      const ata = getAssociatedTokenAddressSync(IOT_MINT, ownerPk, true);
      const hasAta = !!iotAtaInfosByOwner[owner];
      const totalIot = hotspots.reduce(
        (acc, _) => acc.add(IOT_PER_HOTSPOT),
        new BN(0)
      );

      if (!hasAta) {
        const ataIx = createAssociatedTokenAccountIdempotentInstruction(
          lazySigner,
          ata,
          ownerPk,
          IOT_MINT
        );
        ixs.push(ataIx);
        totalBalances.sol = totalBalances.sol.add(new BN(ataRent));
      } else {
      }

      const transferIx = createTransferInstruction(
        ata,
        ownerPk,
        lazySigner,
        BigInt(totalIot.toString())
      );

      totalBalances.iot = totalBalances.iot.add(totalIot);
      ixs.push(transferIx);
      instructions.push({
        instructions: [...ixs],
        wallet: owner,
        signerSeeds: [],
        compute: 30000 * ixs.length,
        size: ixs.reduce((acc, ix) => acc + size(ix), 0),
      });
    }

    await insertTransactions(lazySigner, db, instructions);

    hotspotsByOwner = {}; // Clear memory
    ataKeys.length = 0; // Clear memory
    owners.length = 0; // Clear memory
    iotAtaInfosByOwner = {}; // Clear memory
    gc();

    console.log('Compiling merkle tree');
    let binaryTxs = (
      await db.query(
        `SELECT compiled, signers FROM transactions ORDER BY id ASC`,
        []
      )
    ).rows;

    let txs = binaryTxs.map((tx) => {
      const compiled = decompress(tx.compiled);
      const signers = decompressSigners(tx.signers);
      compiled.signerSeeds = signers;
      return toLeaf(compiled);
    });

    let merkleTree: MerkleTree | null = new MerkleTree(txs);
    let proofIndices = txs.map((_, index) => index);

    binaryTxs.length = 0; // Clear memory
    txs.length = 0; // Clear memory
    gc();

    const canopyDepth = Math.min(17, merkleTree.depth - 1);
    console.log(
      `Merkle tree depth: ${merkleTree.depth - 1}, canopy depth: ${canopyDepth}`
    );

    await Promise.all(
      chunks(chunks(proofIndices, 2000), 4).map(async (chunk) => {
        for (const c of chunk) {
          const proofRows = c.map((index) => {
            const proof = merkleTree!.getProof(
              index,
              false,
              -1,
              false,
              false
            ).proof;
            return [
              index,
              JSON.stringify(
                proof
                  .slice(0, proof.length - canopyDepth)
                  .map((p) => p.toString('hex'))
              ),
            ];
          });
          const query = format(
            `
          INSERT INTO transaction_proofs(
            id, proof
          )
          VALUES %L
        `,
            proofRows
          );
          await db.query(query);
        }
      })
    );

    proofIndices.length = 0;
    gc();

    console.log('Inserting canopy...');
    let canopyNodes = getCanopy({
      merkleTree,
      cacheDepth: canopyDepth,
    });

    let canopyRows = canopyNodes.map((canopy, index) => [index, canopy.node]);

    const root = merkleTree.getRoot().toJSON().data;
    const maxDepth = merkleTree.depth - 1;

    await Promise.all(
      chunks(chunks(canopyRows, 2000), 4).map(async (chunk) => {
        for (const c of chunk) {
          const query = format(
            `
          INSERT INTO canopy(
            id, bytes
          )
          VALUES %L
        `,
            c
          );
          await db.query(query);
        }
      })
    );

    merkleTree = null;
    canopyRows.length = 0;
    gc();

    console.log('Creating tree and canopy...');
    const canopySize = getCanopySize(canopyDepth);
    const canopyAcc = await connection.getAccountInfo(canopy.publicKey);
    const canopyRent = await connection.getMinimumBalanceForRentExemption(
      canopySize
    );

    if (!argv.testing && !canopyAcc) {
      await sendInstructions(
        provider,
        [
          SystemProgram.createAccount({
            fromPubkey: provider.wallet.publicKey,
            newAccountPubkey: canopy.publicKey,
            space: canopySize,
            lamports: canopyRent,
            programId: lazyTransactionsProgram.programId,
          }),
        ],
        [canopy]
      );
    }

    if (!argv.testing) {
      if (await connection.getAccountInfo(lazyTransaction)) {
        await lazyTransactionsProgram.methods
          .updateLazyTransactionsV0({
            root,
            authority: provider.wallet.publicKey,
          })
          .accounts({
            lazyTransactions: lazyTransaction,
            canopy: canopy.publicKey,
          })
          .rpc({ skipPreflight: true });
      } else {
        await lazyTransactionsProgram.methods
          .initializeLazyTransactionsV0({
            root,
            name: argv.name,
            authority: provider.wallet.publicKey,
            maxDepth,
          })
          .accounts({
            canopy: canopy.publicKey,
          })
          .rpc({ skipPreflight: true });
      }
    }

    console.log(`Created lazy transactions ${lazyTransaction} ${argv.name}`);
    const totalTx = Number(
      (await db.query('SELECT count(*) FROM transactions', [])).rows[0].count
    );

    console.log(`Lazy transactions signer ${lazySigner} needs:
      IOT: ${totalBalances.iot.toString()}
      RENT SOL: ${totalBalances.sol.toString()}
      TX SOL: ${new BN(PER_TX * totalTx * LAMPORTS_PER_SOL).toString()}

      TOTAL TXs: ${totalTx}
    `);

    console.log('Loading up lazy signer with iot...');
    const me = provider.wallet.publicKey;
    const transfers = [
      createAssociatedTokenAccountIdempotentInstruction(
        me,
        getAssociatedTokenAddressSync(iot, lazySigner, true),
        lazySigner,
        iot
      ),
      createTransferInstruction(
        getAssociatedTokenAddressSync(iot, me),
        getAssociatedTokenAddressSync(iot, lazySigner, true),
        me,
        BigInt(totalBalances.iot.toString())
      ),
    ];

    !argv.testing ? await sendInstructions(provider, transfers) : noop();

    console.log('Filling canopy, this may fail. Then use fill-canopy script');
    !argv.testing
      ? await fillCanopy({
          program: lazyTransactionsProgram,
          lazyTransactions: lazyTransaction,
          canopy: canopyNodes,
          cacheDepth: canopyDepth,
        })
      : noop();

    const finish = new Date().valueOf();
    console.log(`Finished in ${finish - start}ms`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    process.exit();
  }
})();
