import * as anchor from "@coral-xyz/anchor";
import { batchParallelInstructionsWithPriorityFee } from "@helium/spl-utils";
import {
  init as initVsr,
  proxyVoteMarkerKey,
} from "@helium/voter-stake-registry-sdk";
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
  });

  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  if (argv.resetSubDaoVotingMint && !argv.dntMint) {
    console.log("dnt mint not provided");
    return;
  }

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const hvsrProgram = await initVsr(provider);
  const markers = await hvsrProgram.account.voteMarkerV0.all();

  const proxyMarkers = markers.filter(
    (marker) => marker.account.proxyIndex > 0
  );
  const proxyChoicesByProposal = proxyMarkers.reduce((acc, marker) => {
    const proposal = marker.account.proposal.toBase58();
    if (!acc[proposal]) {
      acc[proposal] = {};
    }
    const key = marker.account.voter.toBase58();
    const proxyChoices = acc[proposal][key];
    if (proxyChoices && !arrayEquals(proxyChoices, marker.account.choices)) {
      console.log(
        `Proxy marker choice mismatch ${key} ${proxyChoices} ${marker.account.choices}`
      );
      acc[proposal][key] =
        marker.account.choices.length > proxyChoices.length
          ? marker.account.choices
          : proxyChoices;
    } else {
      acc[proposal][key] = marker.account.choices;
    }
    return acc;
  }, {} as Record<string, Record<string, number[]>>);

  const instructions: TransactionInstruction[] = [];
  for (const [proposal, proxyChoices] of Object.entries(
    proxyChoicesByProposal
  )) {
    for (const [voter, choices] of Object.entries(proxyChoices)) {
      const proxyMarker = proxyVoteMarkerKey(
        new PublicKey(voter),
        new PublicKey(proposal),
        hvsrProgram.programId
      )[0];
      const markerAccount = await hvsrProgram.account.proxyMarkerV0.fetchNullable(
        proxyMarker
      );
      for (const choice of choices) {
        if (!markerAccount?.choices.includes(choice)) {
          instructions.push(
            await hvsrProgram.methods
              .tempBackfillProxyMarker({ choice })
              .accounts({
                voter: new PublicKey(voter),
                proposal: new PublicKey(proposal),
                marker: proxyMarker,
              })
              .instruction()
          );
        }
      }
    }
  }

  await batchParallelInstructionsWithPriorityFee(provider, instructions, {
    onProgress: console.log,
  });
}

function arrayEquals<T>(a: T[], b: T[]): boolean {
  return (
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    a.every((val, index) => val === b[index])
  );
}
