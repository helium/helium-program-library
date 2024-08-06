import * as anchor from "@coral-xyz/anchor";
import { init as initNftProxy } from "@helium/nft-proxy-sdk";
import {
  Connection,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  TransactionInstruction,
} from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import { loadKeypair } from "./utils";
import { batchSequentialParallelInstructions, truthy } from "@helium/spl-utils";

async function getSolanaUnixTimestamp(connection: Connection): Promise<bigint> {
  const clock = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
  const unixTime = clock!.data.readBigInt64LE(8 * 4);
  return unixTime;
}

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
  });

  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const conn = provider.connection;
  const wallet = new anchor.Wallet(loadKeypair(argv.wallet));
  const proxyProgram = await initNftProxy(provider);
  const solanaTime = await getSolanaUnixTimestamp(provider.connection);
  const proxyAssignments = await proxyProgram.account.proxyAssignmentV0.all();
  const expiredProxyAssignments = proxyAssignments.filter((pa) => {
    const { account } = pa;
    return account.expirationTime.lt(new anchor.BN(Number(solanaTime)));
  });

  const proxyAssignmentsByAsset: {
    [key: string]: (typeof proxyAssignments)[0][];
  } = expiredProxyAssignments.reduce(
    (acc, assignment) => ({
      ...acc,
      [assignment.account.asset.toBase58()]: [
        ...(acc[assignment.account.asset.toBase58()] || []),
        assignment,
      ],
    }),
    {}
  );

  const multiDemArray: TransactionInstruction[][] = Object.entries(
    proxyAssignmentsByAsset
  ).map(async ([_, value], idx) => {
    const sorted = value.sort((a, b) =>
      a.account.index < b.account.index ? 1 : -1
    );

    return (
      await Promise.all(
        sorted.map((proxy, index) => {
          // Can't undelegate the 1st one (Pubkey.default)
          if (index === sorted.length - 1) {
            return Promise.resolve(undefined);
          }

          const prevProxyAssignment = new PublicKey(
            sorted[index + 1].publicKey
          );

          return proxyProgram.methods
            .unassignExpiredProxyV0()
            .accounts({
              prevProxyAssignment,
              proxyAssignment: new PublicKey(proxy.publicKey),
            })
            .instruction();
        })
      )
    ).filter(truthy);
  });

  await batchSequentialParallelInstructions({
    provider,
    instructions: multiDemArray,
  });
}
