import * as anchor from "@coral-xyz/anchor";
import { subDaoKey } from "@helium/helium-sub-daos-sdk";
import { init } from "@helium/hexboosting-sdk";
import { HNT_MINT, MOBILE_MINT, toBN } from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import { loadKeypair, sendInstructionsOrSquads } from "./utils";
import { init as initHsd } from "@helium/helium-sub-daos-sdk";
import { getMint } from "@solana/spl-token";
import Squads from "@sqds/sdk";

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
      default: HNT_MINT.toBase58(),
    },
    dntMint: {
      default: MOBILE_MINT.toBase58(),
      describe: "Public Key of the subdao mint",
      type: "string",
    },
    rentReclaimAuthority: {
      type: "string",
      required: true,
      describe: "The authority to reclaim rent",
    },
    boostPrice: {
      required: true,
      type: "number",
      describe: "The price to boost in usd",
    },
    periodLength: {
      type: "number",
      describe: "The period length in seconds for one boost",
      required: true,
    },
    minimumPeriods: {
      type: "number",
      describe: "The min number of periods to initially boost",
      required: true,
    },
    priceOracle: {
      type: "string",
      describe: "The price oracle to use",
      required: true,
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
  const squads = Squads.endpoint(process.env.ANCHOR_PROVIDER_URL, wallet, {
    commitmentOrConfig: "finalized",
  });
  let multisig = argv.multisig ? new PublicKey(argv.multisig) : undefined;

  const program = await init(provider);
  const hsdProgram = await initHsd(provider);
  const dntMint = new PublicKey(argv.dntMint);
  const mint = await getMint(program.provider.connection, dntMint);
  const subDao = (await subDaoKey(dntMint))[0];

  const subDaoAuth = (await hsdProgram.account.subDaoV0.fetch(subDao)).authority
  const instructions = [
    await program.methods
      .initializeBoostConfigV0({
        boostPrice: toBN(argv.boostPrice, mint.decimals),
        periodLength: argv.periodLength,
        minimumPeriods: argv.minimumPeriods,
      })
      .accounts({
        dntMint,
        priceOracle: new PublicKey(argv.priceOracle),
        rentReclaimAuthority: new PublicKey(argv.rentReclaimAuthority),
        authority: subDaoAuth,
        subDao
      })
      .instruction(),
  ];

  await sendInstructionsOrSquads({
    provider,
    instructions,
    signers: [],
    executeTransaction: false,
    squads,
    multisig,
    authorityIndex: argv.authorityIndex,
  });
}
