import * as anchor from "@coral-xyz/anchor";
import { AccountFetchCache } from "@helium/account-fetch-cache";
import {
  daoKey,
  EPOCH_LENGTH,
  init as initHsd
} from "@helium/helium-sub-daos-sdk";
import { batchParallelInstructionsWithPriorityFee, HNT_MINT } from "@helium/spl-utils";
import {
  TransactionInstruction
} from "@solana/web3.js";
import { BN } from "bn.js";
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
  });

  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const cache = new AccountFetchCache({
    connection: provider.connection,
    commitment: "confirmed",
    extendConnection: true,
  });
  const hsdProgram = await initHsd(provider);
  const daoK = daoKey(HNT_MINT)[0];
  const dao = await hsdProgram.account.daoV0.fetch(daoK);
  const oldestProposal = dao.recentProposals[3].ts;
  const daoEpochInfos = await hsdProgram.account.daoEpochInfoV0.all();
  const affectedDaoEpochInfos = daoEpochInfos.filter(
    (e) => e.account.epoch.mul(new BN(EPOCH_LENGTH)).gt(oldestProposal)
  );

  let instructions: TransactionInstruction[] = [];
  let i = 0;
  for (const daoEpochInfo of affectedDaoEpochInfos) {
    instructions.push(
      await hsdProgram.methods
        .tempBackfillDaoRecentProposals()
        .accountsStrict({
          authority: provider.wallet.publicKey,
          dao: daoK,
          daoEpochInfo: daoEpochInfo.publicKey,
        })
        .instruction()
    );

    if (i > 20) {
      await batchParallelInstructionsWithPriorityFee(provider, instructions, {
        onProgress: console.log,
        computeScaleUp: 2,
      });
      i = 0;
      instructions = [];
    }
    i++;
  }
  await batchParallelInstructionsWithPriorityFee(provider, instructions, {
    onProgress: console.log,
  });
}

// Helper function
function arrayEquals(a: string[], b: string[]): boolean {
  return (
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    a.every((val, index) => val === b[index])
  );
}
