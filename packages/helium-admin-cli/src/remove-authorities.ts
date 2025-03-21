import * as anchor from "@coral-xyz/anchor";
import {
  daoKey,
  init as initHsd,
  subDaoKey
} from "@helium/helium-sub-daos-sdk";
import { init as initCircuitBreaker, mintWindowedBreakerKey } from "@helium/circuit-breaker-sdk";
import { HNT_MINT, IOT_MINT, MOBILE_MINT } from "@helium/spl-utils";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import Squads from "@sqds/sdk";
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
  const program = await initHsd(provider);
  const cbProgram = await initCircuitBreaker(provider);

  const instructions: TransactionInstruction[] = [];

  const dao = daoKey(HNT_MINT)[0];
  const daoAcc = await program.account.daoV0.fetch(dao);
  instructions.push(
    await program.methods
      .tempRemoveMintAndFreezeAuthorities()
      .accountsPartial({
        authority: daoAcc.authority,
        dao,
        mobileMint: MOBILE_MINT,
        iotMint: IOT_MINT,
        hntMint: HNT_MINT,
        iotSubDao: subDaoKey(IOT_MINT)[0],
        mobileSubDao: subDaoKey(MOBILE_MINT)[0],
      })
      .instruction()
  );
  const mobileCB = mintWindowedBreakerKey(MOBILE_MINT)[0];
  const mobileCBAcc = await cbProgram.account.mintWindowedCircuitBreakerV0.fetch(mobileCB);
  instructions.push(
    await cbProgram.methods
      .removeMintAuthorityV0()
      .accountsPartial({
        mint: MOBILE_MINT,
        circuitBreaker: mobileCB,
        rentRefund: mobileCBAcc.authority,
        authority: mobileCBAcc.authority,
      })
      .instruction()
  );
  const iotCB = mintWindowedBreakerKey(IOT_MINT)[0];
  const iotCBAcc =
    await cbProgram.account.mintWindowedCircuitBreakerV0.fetch(iotCB);
  instructions.push(
    await cbProgram.methods
      .removeMintAuthorityV0()
      .accountsPartial({
        mint: IOT_MINT,
        circuitBreaker: iotCB,
        rentRefund: iotCBAcc.authority,
        authority: iotCBAcc.authority,
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
