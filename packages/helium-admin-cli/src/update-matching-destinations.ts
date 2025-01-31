import * as anchor from "@coral-xyz/anchor";
import {
  initializeCompressionRecipient,
  init as initLazy,
} from "@helium/lazy-distributor-sdk";
import { batchParallelInstructionsWithPriorityFee } from "@helium/spl-utils";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";

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
      default: "nJWGUMOK",
      describe: "The lazy transactions instance name",
    },
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const lazyProgram = await initLazy(provider);
  const recipients = await lazyProgram.account.recipientV0.all();

  const LD_IOT = new PublicKey("37eiz5KzYwpAdLgrSh8GT1isKiJ6hcE5ET86dqaoCugL");
  const LD_MOBILE = new PublicKey(
    "GZtTp3AUo2AHdQe9BCJ6gXR9KqfruRvHnZ4QiJUALMcz"
  );
  const LD_HNT = new PublicKey("6gcZXjHgKUBMedc2V1aZLFPwh8M1rPVRw7kpo2KqNrFq");

  const needUpdate = recipients.filter(
    (r) =>
      !r.account.destination.equals(PublicKey.default) &&
      (r.account.lazyDistributor.equals(LD_IOT) ||
        r.account.lazyDistributor.equals(LD_MOBILE))
  );
  const hntRecipientsByKey = recipients
    .filter((r) => r.account.lazyDistributor.equals(LD_HNT))
    .reduce((acc, r) => {
      acc[r.account.destination.toString()] = r;
      return acc;
    }, {});

  const instructions: TransactionInstruction[] = [];
  for (const r of needUpdate) {
    const asset = r.account.asset;
    const assetOnChain = await provider.connection.getAccountInfo(asset);
    // Only doing this to cNFTs
    if (!assetOnChain) {
      const hntRecipient = hntRecipientsByKey[r.account.destination.toString()];
      if (!hntRecipient || hntRecipient?.account.destination.equals(PublicKey.default)) {
        let hntRecipientKey = hntRecipient?.publicKey;
        if (!hntRecipient) {
          const { instruction, pubkeys } = await (
            await initializeCompressionRecipient({
              program: lazyProgram,
              assetId: asset,
              lazyDistributor: LD_HNT,
              payer: provider.wallet.publicKey,
            })
          ).prepare();
          hntRecipientKey = pubkeys.recipient;
          instructions.push(instruction);
        }

        instructions.push(
          await lazyProgram.methods
            .tempUpdateMatchingDestination()
            .accountsStrict({
              recipient: hntRecipientKey,
              authority: provider.wallet.publicKey,
              originalRecipient: r.publicKey,
            })
            .instruction()
        );
      }
    }
  }

  await batchParallelInstructionsWithPriorityFee(provider, instructions);
}
