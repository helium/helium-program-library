import * as anchor from "@coral-xyz/anchor";
import { AccountFetchCache } from "@helium/account-fetch-cache";
import {
  delegatedPositionKey,
  init as initHsd,
} from "@helium/helium-sub-daos-sdk";
import { batchParallelInstructionsWithPriorityFee } from "@helium/spl-utils";
import { init as initVsr } from "@helium/voter-stake-registry-sdk";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { BN } from "bn.js";
import fs from "fs";
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
    recentProposalsFile: {
      alias: "m",
      describe: "The mistake file",
      default: "mistake.json",
    },
  });

  const argv = await yarg.argv;
  const recentProposals = JSON.parse(
    fs.readFileSync(argv.recentProposalsFile, "utf8")
  );
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
  const vsrProgram = await initVsr(provider)

  let instructions: TransactionInstruction[] = [];
  let delIndex = 0;
  let i = 0;
  const delegationKeys = recentProposals.map(
    ({ position }) => delegatedPositionKey(new PublicKey(position))[0]
  );
  const delegations =
    await hsdProgram.account.delegatedPositionV0.fetchMultiple(delegationKeys);
  for (const { position, proposals } of recentProposals) {
    const delegation = delegations[delIndex];

    if (delegation?.deprecatedRecentProposals) {
      const deprecatedProposals = delegation.deprecatedRecentProposals.map(
        (p) => p.proposal.toBase58()
      );
      const currentProposals = proposals.map((p) => p.proposal);

      if (!arrayEquals(deprecatedProposals, currentProposals)) {
        throw new Error(
          `Deprecated recent proposals mismatch for delegation ${delegation.position.toBase58()}:\n` +
            `Deprecated: ${deprecatedProposals.join(", ")}\n` +
            `Current: ${currentProposals.join(", ")}`
        );
      }
    }

    instructions.push(
      await vsrProgram.methods
        .tempBackfillRecentProposals({
          recentProposals: proposals.map(({ proposal, ts }) => ({
            proposal: new PublicKey(proposal),
            ts: new BN(ts),
          })),
        })
        .accountsStrict({
          authority: provider.wallet.publicKey,
          registrar: new PublicKey(
            "BMnWRWZrWqb6JMKznaDqNxWaWAHoaTzVabM6Qwyh3WKz"
          ),
          position: new PublicKey(position),
          systemProgram: SystemProgram.programId,
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
    delIndex++;
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
