import * as anchor from "@coral-xyz/anchor";
import {
  delegatedPositionKey,
  EPOCH_LENGTH,
  init as initHsd,
} from "@helium/helium-sub-daos-sdk";
import { sendInstructionsWithPriorityFee } from "@helium/spl-utils";
import {
  compileTransaction,
  customSignerKey,
  init as initTuktuk,
  taskKey,
} from "@helium/tuktuk-sdk";
import { init as initVsr } from "@helium/voter-stake-registry-sdk";
import { getAccount } from "@solana/spl-token";
import {
  PublicKey,
  TransactionInstruction
} from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import { HplCrons } from "../../target/types/hpl_crons";
import BN from "bn.js";

const PROGRAM_ID = new PublicKey("hcrLPFgFUY6sCUKzqLWxXx5bntDiDCrAZVcrXfx9AHu");

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
    position: {
      required: true,
      type: "string",
      describe: "The position to trigger automated claims for",
    },
    initialFunding: {
      required: true,
      type: "number",
      describe: "The initial funding in lamports for crank turns",
    },
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const taskQueue = new PublicKey(argv.taskQueue);
  const idl = await anchor.Program.fetchIdl(PROGRAM_ID, provider);
  const program = new anchor.Program<HplCrons>(
    idl as HplCrons,
    provider
  ) as anchor.Program<HplCrons>;
  const vsrProgram = await initVsr(provider);
  const hsdProgram = await initHsd(provider);
  const tuktukProgram = await initTuktuk(provider);
  const taskQueueAcc = await tuktukProgram.account.taskQueueV0.fetch(taskQueue);
  const nextAvailable = nextAvailableTaskIds(taskQueueAcc.taskBitmap, 1)[0];
  const [task] = taskKey(taskQueue, nextAvailable);
  const position = new PublicKey(argv.position);
  const positionAcc = await vsrProgram.account.positionV0.fetch(position);
  const delegatedPosition = delegatedPositionKey(position)[0];
  const delegatedPositionAcc =
    await hsdProgram.account.delegatedPositionV0.fetch(delegatedPosition);
  const [customWallet, bump] = customSignerKey(taskQueue, [
    Buffer.from("helium", "utf-8"),
  ]);
  const [positionClaimPayer, positionClaimPayerBump] = customSignerKey(
    taskQueue,
    [Buffer.from("position", "utf-8"), position.toBuffer()]
  );
  const bumpBuffer = Buffer.alloc(1);
  bumpBuffer.writeUint8(bump);
  const positionClaimPayerBumpBuffer = Buffer.alloc(1);
  positionClaimPayerBumpBuffer.writeUint8(positionClaimPayerBump);
  const claimBot = PublicKey.findProgramAddressSync(
    [
      Buffer.from("delegation_claim_bot", "utf-8"),
      taskQueue.toBuffer(),
      delegatedPosition.toBuffer(),
    ],
    PROGRAM_ID
  )[0];
  const instructions: TransactionInstruction[] = [];
  const account = await provider.connection.getTokenLargestAccounts(
    positionAcc.mint
  );
  const positionTokenAccount = account.value[0];
  if (!(await provider.connection.getAccountInfo(claimBot))) {
    instructions.push(
      await program.methods
        .initDelegationClaimBotV0()
        .accounts({
          delegatedPosition,
          taskQueue,
          positionTokenAccount: positionTokenAccount.address,
        })
        .instruction()
    );
  }
  const bot = await program.account.delegationClaimBotV0.fetch(claimBot);
  console.log("Payer for claims", positionClaimPayer.toBase58());
  const { transaction, remainingAccounts } = compileTransaction(
    [
      await program.methods
        .queueDelegationClaimV0()
        .accountsPartial({
          delegationClaimBot: claimBot,
          positionAuthority: (
            await getAccount(provider.connection, positionTokenAccount.address)
          ).owner,
          positionTokenAccount: positionTokenAccount.address,
        })
        .instruction(),
    ],
    [[Buffer.from("helium", "utf-8"), bumpBuffer]]
  );

  // @ts-ignore
  const endOfEpoch = (delegatedPositionAcc.lastClaimedEpoch as BN)
    .add(new BN(2))
    .mul(new BN(EPOCH_LENGTH));

  instructions.push(
    await tuktukProgram.methods
      .queueTaskV0({
        id: nextAvailable,
        trigger: { timestamp: [endOfEpoch.sub(new BN(60 * 10))] },
        crankReward: null,
        freeTasks: 2,
        transaction: {
          compiledV0: [transaction],
        },
      })
      .accounts({
        task,
        taskQueue,
      })
      .remainingAccounts(remainingAccounts)
      .instruction()
  );

  await sendInstructionsWithPriorityFee(provider, instructions);
}

function nextAvailableTaskIds(taskBitmap: Buffer, n: number): number[] {
  if (n === 0) {
    return [];
  }

  const availableTaskIds: number[] = [];
  for (let byteIdx = 0; byteIdx < taskBitmap.length; byteIdx++) {
    const byte = taskBitmap[byteIdx];
    if (byte !== 0xff) {
      // If byte is not all 1s
      for (let bitIdx = 0; bitIdx < 8; bitIdx++) {
        if ((byte & (1 << bitIdx)) === 0) {
          availableTaskIds.push(byteIdx * 8 + bitIdx);
          if (availableTaskIds.length === n) {
            return availableTaskIds;
          }
        }
      }
    }
  }
  return availableTaskIds;
}
