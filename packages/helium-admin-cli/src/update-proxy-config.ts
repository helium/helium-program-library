import * as anchor from "@coral-xyz/anchor";
import {
  init as initProxy,
  proxyConfigKey,
} from "@helium/nft-proxy-sdk";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import Squads from "@sqds/sdk";
import fs from "fs";
import os from "os";
import yargs from "yargs/yargs";
import {
  loadKeypair,
  sendInstructionsOrSquads
} from "./utils";

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
    name: {
      required: true,
      type: "string",
      describe: "Name of the proxy config to be updated",
    },
    maxProxyTime: {
      required: false,
      describe: "New max proxy time",
      type: "string",
      default: null,
    },
    proxySeasonsFile: {
      type: "string",
      default: `${__dirname}/../../proxy-seasons.json`,
    },
    executeTransaction: {
      type: "boolean",
    },
    multisig: {
      type: "string",
      describe:
        "Address of the squads multisig to be authority. If not provided, your wallet will be the authority",
    },
    authorityIndex: {
      type: "number",
      describe: "Authority index for squads. Defaults to 1",
      default: 1,
    },
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const wallet = new anchor.Wallet(loadKeypair(argv.wallet));
  const proxySeasonsFile = fs.readFileSync(argv.proxySeasonsFile, "utf8");
  const seasons = JSON.parse(proxySeasonsFile).map((s) => ({
    start: new anchor.BN(Math.floor(Date.parse(s.start) / 1000)),
    end: new anchor.BN(Math.floor(Date.parse(s.end) / 1000)),
  }));

  const program = await initProxy(provider);

  const instructions: TransactionInstruction[] = [];
  const proxyConfig = proxyConfigKey(argv.name)[0];
  const proxyConfigAcc = await program.account.proxyConfigV0.fetch(proxyConfig);

  instructions.push(
    await program.methods
      .updateProxyConfigV0({
        maxProxyTime: argv.maxProxyTime ? new anchor.BN(argv.maxProxyTime) : null,
        seasons,
      })
      .accounts({
        proxyConfig,
        authority: proxyConfigAcc.authority,
      })
      .instruction()
  );

  const squads = Squads.endpoint(process.env.ANCHOR_PROVIDER_URL, wallet, {
    commitmentOrConfig: "finalized",
  });
  await sendInstructionsOrSquads({
    provider,
    instructions,
    executeTransaction: argv.executeTransaction,
    squads,
    multisig: argv.multisig ? new PublicKey(argv.multisig) : undefined,
    authorityIndex: argv.authorityIndex,
    signers: [],
  });
}
