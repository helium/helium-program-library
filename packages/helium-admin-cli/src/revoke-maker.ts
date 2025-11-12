import * as anchor from "@coral-xyz/anchor";
import { init as initHem, makerKey, rewardableEntityConfigKey } from "@helium/helium-entity-manager-sdk";
import { daoKey, subDaoKey } from "@helium/helium-sub-daos-sdk";
import { HNT_MINT } from "@helium/spl-utils";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import { loadKeypair, sendInstructionsOrSquadsV4 } from "./utils";

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
      alias: "n",
      type: "string",
      required: true,
      describe: "Name of the maker, case sensitive",
    },
    multisig: {
      type: "string",
      describe:
        "Address of the squads multisig to be authority. If not provided, your wallet will be the authority",
    },
    dntMint: {
      type: "string",
      describe: "The dnt mint to revoke",
      required: true,
    },
    symbol: {
      alias: "s",
      type: "string",
      required: true,
      describe: "The symbol of the entity config",
    },
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const wallet = new anchor.Wallet(loadKeypair(argv.wallet));
  const program = await initHem(provider);

  const instructions: TransactionInstruction[] = [];

  const maker = makerKey(daoKey(HNT_MINT)[0], argv.name)[0];
  // Ensure the maker exists
  await program.account.makerV0.fetch(maker);
  const rewardableEntityConfigK = rewardableEntityConfigKey(
    subDaoKey(new PublicKey(argv.dntMint))[0],
    argv.symbol
  )[0];
  const rewardableEntityConfig =
    await program.account.rewardableEntityConfigV0.fetch(
      rewardableEntityConfigK
    );

  instructions.push(
    await program.methods
      .revokeMakerV0()
      .accountsPartial({
        maker,
        authority: rewardableEntityConfig.authority,
        rewardableEntityConfig: rewardableEntityConfigK,
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
