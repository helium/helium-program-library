import * as anchor from "@coral-xyz/anchor";
import {
  init as initHem, keyToAssetKey,
} from "@helium/helium-entity-manager-sdk";
import { daoKey, init as initHsd } from "@helium/helium-sub-daos-sdk";
import { PublicKey } from "@solana/web3.js";
import Squads from "@sqds/sdk";
import os from "os";
import yargs from "yargs/yargs";
import { sendInstructionsOrSquads } from "./utils";

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
      required: true,
      type: "string",
      describe: "HNT mint of the dao to be updated",
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
  const program = await initHem(provider);
  const daosProgram = await initHsd(provider);

  const instructions = [];

  const hntMint = new PublicKey(argv.hntMint);
  const dao = daoKey(hntMint)[0];
  const daoAcc = await daosProgram.account.daoV0.fetch(dao);
  instructions.push(
    await program.methods
      .tempRepairIotOperationsFund()
      .accounts({
        dao,
        authority: daoAcc.authority,
        payer: daoAcc.authority,
        keyToAsset: keyToAssetKey(dao, "iot_operations_fund", "utf8")[0]
      })
      .instruction()
  );

  const squads = Squads.endpoint(
    process.env.ANCHOR_PROVIDER_URL,
    provider.wallet,
    {
      commitmentOrConfig: "finalized",
    }
  );
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
