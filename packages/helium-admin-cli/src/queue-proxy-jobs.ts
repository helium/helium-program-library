import * as anchor from "@coral-xyz/anchor";
import { organizationKey } from "@helium/organization-sdk";
import { init as initProposal } from "@helium/proposal-sdk";
import { batchParallelInstructionsWithPriorityFee } from "@helium/spl-utils";
import { init as initStateController } from "@helium/state-controller-sdk";
import {
  customSignerKey,
  init as initTuktuk,
  taskKey,
  taskQueueAuthorityKey,
} from "@helium/tuktuk-sdk";
import { init as initVsr } from "@helium/voter-stake-registry-sdk";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import { HplCrons } from "@helium/idls/lib/types/hpl_crons";
import { nextAvailableTaskIds } from "@helium/tuktuk-sdk";

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
  const proposalProgram = await initProposal(provider);
  const stateControllerProgram = await initStateController(provider);
  const vsrProgram = await initVsr(provider);
  const tuktukProgram = await initTuktuk(provider);
  const taskQueueAcc = await tuktukProgram.account.taskQueueV0.fetch(taskQueue);
  // @ts-ignore
  const proxyMarkers = await vsrProgram.account.proxyMarkerV0.all();

  const distinctProposals: Set<string> = new Set(proxyMarkers.map((m) => m.account.proposal.toBase58()));
  const proposalKeys = Array.from(distinctProposals).map(d => new PublicKey(d));
  const proposals = await proposalProgram.account.proposalV0.fetchMultiple(proposalKeys);
  const proposalConfigs = await proposalProgram.account.proposalConfigV0.fetchMultiple(proposals.map(p => p!.proposalConfig));
  const resolutions = await stateControllerProgram.account.resolutionSettingsV0.fetchMultiple(proposalConfigs.map(pc => pc!.stateController));

  const endTsByProposal: Record<string, anchor.BN> = proposals.reduce((acc, proposal, i) => {
    const resolution = resolutions[i]
    acc[proposalKeys[i].toBase58()] = (resolution &&
      (proposal?.state.resolved
        ? proposal?.state.resolved.endTs
        : proposal?.state.voting?.startTs.add(
            resolution.settings.nodes.find(
              (node) => typeof node.offsetFromStartTs !== "undefined"
            )?.offsetFromStartTs?.offset ?? new anchor.BN(0)
          )))!
    return acc;
  }, {} as Record<string, anchor.BN>);
  const proposalsByPubkey = proposals.reduce((acc, proposal, i) => {
    acc[proposalKeys[i].toBase58()] = proposal;
    return acc;
  }, {} as Record<string, any>);

  const nextAvailable = nextAvailableTaskIds(taskQueueAcc.taskBitmap, proxyMarkers.length);
  const instructions: TransactionInstruction[] = [];
  const org = organizationKey("Helium")[0]
  for (const marker of proxyMarkers) {
    const currTs = new Date().valueOf() / 1000;
    const endTs = endTsByProposal[marker.account.proposal.toBase58()];
    const proposal = proposalsByPubkey[marker.account.proposal.toBase58()];
    if (endTs!.toNumber() > currTs && proposal?.namespace?.equals(org)) {
      const queueAuthority = PublicKey.findProgramAddressSync(
        [Buffer.from("queue_authority")],
        program.programId
      )[0];
      const task1 = nextAvailable.pop()!;
      instructions.push(
        await program.methods
          .queueProxyVoteV0({
            freeTaskId: task1,
          })
          .accountsStrict({
            marker: marker.publicKey,
            task: taskKey(taskQueue, task1)[0],
            taskQueue,
            payer: provider.wallet.publicKey,
            systemProgram: SystemProgram.programId,
            queueAuthority,
            tuktukProgram: tuktukProgram.programId,
            voter: marker.account.voter,
            pdaWallet: customSignerKey(taskQueue, [
              Buffer.from("vote_payer"),
              marker.account.voter.toBuffer(),
            ])[0],
            taskQueueAuthority: taskQueueAuthorityKey(
              taskQueue,
              queueAuthority
            )[0],
          })
          .instruction(),
      );
    }
  }

  await batchParallelInstructionsWithPriorityFee(provider, instructions, {
    onProgress: console.log,
  });
}
