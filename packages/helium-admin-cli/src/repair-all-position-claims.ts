import * as anchor from "@coral-xyz/anchor";
import { AccountFetchCache } from "@helium/account-fetch-cache";
import {
  daoKey,
  init as initHsd
} from "@helium/helium-sub-daos-sdk";
import {
  init as initHplCrons,
  nextAvailableTaskIds
} from "@helium/hpl-crons-sdk";
import { chunks, HNT_MINT, sendInstructionsWithPriorityFee, truthy } from "@helium/spl-utils";
import {
  init as initTuktuk,
  taskKey
} from "@helium/tuktuk-sdk";
import { init as initVsr } from "@helium/voter-stake-registry-sdk";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  PublicKey
} from "@solana/web3.js";
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
    taskQueue: {
      required: true,
      type: "string",
      alias: "t",
      describe: "The task queue to queue",
      default: "H39gEszvsi6AT4rYBiJTuZHJSF5hMHy6CKGTd7wzhsg7",
    },
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const taskQueue = new PublicKey(argv.taskQueue);
  const program = await initHplCrons(provider);
  const vsrProgram = await initVsr(provider);
  const hsdProgram = await initHsd(provider);
  const tuktukProgram = await initTuktuk(provider);
  const cache = new AccountFetchCache({
    connection: provider.connection,
    commitment: "confirmed",
    extendConnection: true,
  });
  const taskQueueAcc = await tuktukProgram.account.taskQueueV0.fetch(taskQueue);

  const bots = (await program.account.delegationClaimBotV0.all()).filter(
    (bot) => bot.account.nextTask.toBase58() === PublicKey.default.toBase58()
  );
  const delegatedPositions = await hsdProgram.account.delegatedPositionV0.fetchMultiple(bots.map((bot) => bot.account.delegatedPosition));
  const positions = await hsdProgram.account.positionV0.fetchMultiple(delegatedPositions.map((dp) => dp?.position || PublicKey.default));
  const nextAvailable = nextAvailableTaskIds(taskQueueAcc.taskBitmap, bots.length);
  const botsWithDelegatedPositions = bots.map((bot, index) => ({
    ...bot,
    delegatedPosition: delegatedPositions[index],
    position: positions[index]
  }));
  console.log("Updating", bots.length, "bots");
  for (const chunk of chunks(botsWithDelegatedPositions, 2)) {
    const instructions = (await Promise.all(
      chunk.map(async (bot) => {
        if (bot.delegatedPosition) {
          const taskId = nextAvailable.pop()!;
          if (!bot.position) {
            return null
          }
          const ataAddr = (await provider.connection.getTokenLargestAccounts(bot.position.mint)).value[0].address;
          const ata = await getAccount(provider.connection, ataAddr);
          const task = taskKey(taskQueue, taskId)[0];
          return await program.methods
            .startDelegationClaimBotV1({ taskId })
            .accountsPartial({
              delegationClaimBot: bot.publicKey,
              task,
              mint: bot.position.mint,
              subDao: bot.delegatedPosition!.subDao,
              positionTokenAccount: ataAddr,
              taskQueue,
              hntMint: HNT_MINT,
              dao: daoKey(HNT_MINT)[0],
              delegatedPosition: bot.account.delegatedPosition,
              delegatorAta: getAssociatedTokenAddressSync(
                HNT_MINT,
                ata.owner
              ),
              nextTask: task,
              rentRefund: bot.account.rentRefund,
            })
            .instruction();
        }
      })
    )).filter(truthy);

    if (instructions.length > 0) {
      await sendInstructionsWithPriorityFee(provider, instructions, {
        computeUnitLimit: 1000000,
      });
    }
  }
}
