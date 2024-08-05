import * as anchor from "@coral-xyz/anchor";
import { init as initNftProxy } from "@helium/nft-proxy-sdk";
import { Connection, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import { loadKeypair } from "./utils";

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
  const proxyAssignemtns = await proxyProgram.account.proxyAssignmentV0.all();
  const expiredProxyAssignments = proxyAssignemtns.filter((pa) => {
    const { account } = pa;
    return account.expirationTime.lt(new anchor.BN(Number(solanaTime)));
  });
}
