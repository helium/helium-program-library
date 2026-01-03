import * as anchor from "@coral-xyz/anchor";
import { boostConfigKey, init as initHex } from "@helium/hexboosting-sdk";
import { MOBILE_MINT } from "@helium/spl-utils";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import { loadKeypair, sendInstructionsOrSquadsV4 } from "./utils";
import {
  init as initHsd,
  subDaoKey,
} from "@helium/helium-sub-daos-sdk";

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
    multisig: {
      type: "string",
      describe:
        "Address of the squads multisig to be authority. If not provided, your wallet will be the authority",
    },
    startAuthority: {
      type: "string",
      describe: "The new start authority to set",
    },
    rentReclaimAuthority: {
      type: "string",
      describe: "The rent reclaim authority to set",
    },
    priceOracle: {
      type: "string",
      describe: "The new price oracle to set",
    },
    minimumPeriods: {
      type: "number",
      describe: "The new minimum number of periods",
    },
    boostPrice: {
      type: "string",
      describe: "The boost price in bones",
    },
    dntMint: {
      type: "string",
      describe: "DNT mint of the boost config",
      default: MOBILE_MINT.toBase58(),
    },
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const wallet = new anchor.Wallet(loadKeypair(argv.wallet));
  const program = await initHex(provider);
  const hsdProgram = await initHsd(provider);

  const instructions: TransactionInstruction[] = [];

  const dntMint = new PublicKey(argv.dntMint);
  const subDaoK = subDaoKey(dntMint)[0]
  const subDao = await hsdProgram.account.subDaoV0.fetch(subDaoK)
  instructions.push(
    await program.methods
      .updateBoostConfigV0({
        startAuthority: argv.startAuthority
          ? new PublicKey(argv.startAuthority)
          : null,
        rentReclaimAuthority: argv.rentReclaimAuthority
          ? new PublicKey(argv.rentReclaimAuthority)
          : null,
        priceOracle: argv.priceOracle ? new PublicKey(argv.priceOracle) : null,
        minimumPeriods: argv.minimumPeriods || null,
        boostPrice: argv.boostPrice ? new anchor.BN(argv.boostPrice) : null,
        dcMint: null,
      })
      .accountsPartial({
        boostConfig: boostConfigKey(dntMint)[0],
        authority: subDao.authority,
      })
      .instruction()
  );

  await sendInstructionsOrSquadsV4({
    provider,
    instructions,
    multisig: argv.multisig ? new PublicKey(argv.multisig) : undefined,
    signers: [],
  });
}
