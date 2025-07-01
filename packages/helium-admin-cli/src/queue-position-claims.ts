import * as anchor from "@coral-xyz/anchor";
import {
  delegatedPositionKey,
  EPOCH_LENGTH,
  init as initHsd,
} from "@helium/helium-sub-daos-sdk";
import { sendInstructionsWithPriorityFee } from "@helium/spl-utils";
import {
  customSignerKey,
  init as initTuktuk,
  taskKey,
} from "@helium/tuktuk-sdk";
import { init as initVsr } from "@helium/voter-stake-registry-sdk";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import os from "os";
import yargs from "yargs/yargs";
import {
  init as initHplCrons,
  delegationClaimBotKey,
  nextAvailableTaskIds,
} from "@helium/hpl-crons-sdk";

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
    [Buffer.from("position", "utf-8")]
  );
  const bumpBuffer = Buffer.alloc(1);
  bumpBuffer.writeUint8(bump);
  const positionClaimPayerBumpBuffer = Buffer.alloc(1);
  positionClaimPayerBumpBuffer.writeUint8(positionClaimPayerBump);
  const claimBot = delegationClaimBotKey(taskQueue, delegatedPosition)[0];
  const instructions: TransactionInstruction[] = [];
  const account = await provider.connection.getTokenLargestAccounts(
    positionAcc.mint
  );
  const positionTokenAccount = account.value[0];
  if (!(await provider.connection.getAccountInfo(claimBot))) {
    instructions.push(
      await program.methods
        .initDelegationClaimBotV0()
        .accountsPartial({
          delegatedPosition,
          position: delegatedPositionAcc.position,
          taskQueue,
          mint: positionAcc.mint,
          positionTokenAccount: positionTokenAccount.address,
        })
        .instruction()
    );
    // @ts-ignore
    const endEpoch = (delegatedPositionAcc.expirationTs as BN).div(
      new BN(EPOCH_LENGTH)
    );
    instructions.push(
      SystemProgram.transfer({
        fromPubkey: provider.wallet.publicKey,
        toPubkey: claimBot,
        lamports: BigInt(
          taskQueueAcc.minCrankReward
            .mul(
              endEpoch.sub(
                // @ts-ignore
                delegatedPositionAcc.lastClaimedEpoch
              )
            )
            .toString()
        ),
      })
    );
  }
  console.log("Payer for claims", positionClaimPayer.toBase58());
  // TODO: Have to do a bunch of manual stuff because the anchor 28 IDL
  // prevents account resolution from working :/
  const subDaoAcc = await hsdProgram.account.subDaoV0.fetch(
    delegatedPositionAcc.subDao
  );
  const daoAcc = await hsdProgram.account.daoV0.fetch(subDaoAcc.dao);
  const { instruction, pubkeys } = await program.methods
    .startDelegationClaimBotV1({
      taskId: nextAvailable,
    })
    .accountsPartial({
      delegationClaimBot: claimBot,
      subDao: delegatedPositionAcc.subDao,
      dao: subDaoAcc.dao,
      mint: positionAcc.mint,
      hntMint: daoAcc.hntMint,
      positionAuthority: (
        await getAccount(provider.connection, positionTokenAccount.address)
      ).owner,
      positionTokenAccount: positionTokenAccount.address,
      taskQueue,
      delegatedPosition,
      systemProgram: SystemProgram.programId,
      delegatorAta: getAssociatedTokenAddressSync(
        daoAcc.hntMint,
        provider.wallet.publicKey
      ),
      task,
    })
    .prepare();

  console.log("Queue authority is", pubkeys.queueAuthority!.toBase58());
  instructions.push(instruction);

  await sendInstructionsWithPriorityFee(provider, instructions, {
    computeUnitLimit: 500000,
  });
}
