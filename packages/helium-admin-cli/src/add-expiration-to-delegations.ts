import * as anchor from "@coral-xyz/anchor";
import { daoKey, init as initHsd, subDaoEpochInfoKey } from "@helium/helium-sub-daos-sdk";
import { init as initProxy } from "@helium/nft-proxy-sdk";
import { batchInstructionsToTxsWithPriorityFee, batchParallelInstructionsWithPriorityFee, bulkSendTransactions, HNT_MINT } from "@helium/spl-utils";
import { init as initVsr } from "@helium/voter-stake-registry-sdk";
import { AccountInfo, PublicKey, SystemProgram, SYSVAR_CLOCK_PUBKEY, TransactionInstruction } from "@solana/web3.js";
import { min } from "bn.js";
import os from "os";
import yargs from "yargs/yargs";
import { loadKeypair } from "./utils";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

export async function run(args: any = process.argv) {
  const yarg = yargs(args).options({
    wallet: {
      alias: "k",
      describe: "Anchor wallet keypair",
      default: `${os.homedir()}/.config/solana/id.json`,
    },
    url: {
      alias: "u",
      default: "http://127.0.0.1:8899",
      describe: "The solana url",
    },
    hntMint: {
      type: "string",
      describe: "HNT mint of the dao to be updated",
      default: HNT_MINT.toBase58(),
    },
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const wallet = new anchor.Wallet(loadKeypair(argv.wallet));
  const proxyProgram = await initProxy(provider);
  const vsrProgram = await initVsr(provider);
  const hsdProgram = await initHsd(provider);

  const hntMint = new PublicKey(argv.hntMint);
  const dao = daoKey(hntMint)[0];
  const registrarK = (await hsdProgram.account.daoV0.fetch(dao)).registrar;
  const registrar = await vsrProgram.account.registrar.fetch(registrarK);
  const proxyConfig = await proxyProgram.account.proxyConfigV0.fetch(
    registrar.proxyConfig
  );

  const instructions: TransactionInstruction[] = [];
  const delegations = await hsdProgram.account.delegatedPositionV0.all();
  const needsMigration = delegations.filter(d => d.account.expirationTs.isZero());
  const positionKeys = needsMigration.map((d) => d.account.position);
  const coder = vsrProgram.coder.accounts;
  const positionAccs = (
    await getMultipleAccounts({
      connection: provider.connection,
      keys: positionKeys,
    })
  ).map((a) => a ? coder.decode("positionV0", a.data) : null);

  const currTs = await getSolanaUnixTimestamp(provider);
  const currTsBN = new anchor.BN(currTs.toString());
  const proxyEndTs = proxyConfig.seasons
    .reverse()
    .find((s) => currTsBN.gte(s.start))?.end;
  console.log(`Processing ${needsMigration.length} delegations`);
  // Process in batches of 10
  const batchSize = 10;
  for (let i = 0; i < needsMigration.length; i += batchSize) {
    // Log progress every 100 positions
    if (i > 0 && i % 100 === 0) {
      console.log(`Processed ${i} delegations`);
    }

    const batch = needsMigration.slice(i, i + batchSize);
    const batchPositions = positionAccs.slice(i, i + batchSize);
    
    await Promise.all(batch.map(async (delegation, j) => {
      const position = batchPositions[j];
      if (!position) {
        console.log(`Position not found for ${delegation.account.position.toBase58()}`);
        return;
      }

      const subDao = delegation.account.subDao;
      const positionTokenAccount = (
        await provider.connection.getTokenLargestAccounts(position.mint)
      ).value[0].address;
      
      instructions.push(
        await hsdProgram.methods
          .extendExpirationTsV0()
          .accountsStrict({
            payer: wallet.publicKey,
            position: delegation.account.position,
            delegatedPosition: delegation.publicKey,
            registrar: registrarK,
            mint: position.mint,
            authority: wallet.publicKey,
            positionTokenAccount,
            dao,
            subDao: delegation.account.subDao,
            oldClosingTimeSubDaoEpochInfo: subDaoEpochInfoKey(
              subDao,
              delegation.account.expirationTs.isZero()
                ? position.lockup.endTs
                : min(position.lockup.endTs, delegation.account.expirationTs)
            )[0],
            closingTimeSubDaoEpochInfo: subDaoEpochInfoKey(
              subDao,
              min(position.lockup.endTs, proxyEndTs!)
            )[0],
            genesisEndSubDaoEpochInfo: subDaoEpochInfoKey(
              subDao,
              position.genesisEnd.lt(currTsBN) ?
                min(position.lockup.endTs, proxyEndTs!) : position.genesisEnd
            )[0],
            proxyConfig: registrar.proxyConfig,
            systemProgram: SystemProgram.programId,
          })
          .instruction()
      );
    }));
  }
  console.log(`Finished processing ${needsMigration.length} delegations`);

  const transactions = await batchInstructionsToTxsWithPriorityFee(
    provider,
    instructions,
    {
      useFirstEstimateForAll: true,
      computeUnitLimit: 400000,
    }
  );

  await bulkSendTransactions(provider, transactions, console.log, 10, [], 100);
}

async function getMultipleAccounts({
  connection,
  keys,
}): Promise<AccountInfo<Buffer>[]> {
  const batchSize = 100;
  const batches = Math.ceil(keys.length / batchSize);
  const results: AccountInfo<Buffer>[] = [];

  for (let i = 0; i < batches; i++) {
    const batchKeys = keys.slice(i * batchSize, (i + 1) * batchSize);
    const batchResults = await connection.getMultipleAccountsInfo(batchKeys);
    results.push(...batchResults);
  }

  return results;
}

function zip<T, U>(a: T[], b: U[]): [T, U][] {
  return a.map((_, i) => [a[i], b[i]]);
}

async function getSolanaUnixTimestamp(
  provider: anchor.AnchorProvider
): Promise<bigint> {
  const clock = await provider.connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
  const unixTime = clock!.data.readBigInt64LE(8 * 4);
  return unixTime;
}