import { AnchorProvider, BN, Program, Wallet } from "@anchor-lang/core";
import cors from "@fastify/cors";
import { Tuktuk } from "@helium/tuktuk-idls/lib/types/tuktuk";
import {
  compileTransaction,
  customSignerKey,
  init,
  RemoteTaskTransactionV0,
} from "@helium/tuktuk-sdk";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import Fastify, { FastifyInstance } from "fastify";
import { sign } from "tweetnacl";
import { init as initTuktukDca } from "@helium/tuktuk-dca-sdk";
import { crankTransactionSize, runTaskRemainingAccounts } from "./crank";
import {
  answerDcaRequest,
  BuildDcaTask,
  DcaRequestBody,
  DcaRequestDeps,
} from "./dca-request";
import { wrapRoute } from "./wrap";
import {
  buildJupiterSwap,
  dcaSwapRequest,
  refuseSetupCreationsOnChain,
} from "./jupiter";
import {
  DCA_SIGNER,
  JUPITER_API_KEY,
  JUPITER_API_URL,
  PORT,
  SLIPPAGE_BPS,
  SOLANA_URL,
} from "./env";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

const server: FastifyInstance = Fastify({
  logger: true,
});

server.register(cors, {
  origin: "*",
});

server.get("/health", async () => {
  return { ok: true };
});

const wallet = new Wallet(DCA_SIGNER);

const provider = new AnchorProvider(new Connection(SOLANA_URL), wallet, {
  commitment: "finalized",
});

/** Stands in for the crank turner, which pays for and signs the run, in the size estimate. */
const CRANK_TURNER_STAND_IN = Keypair.generate().publicKey;

let tuktukProgram: Promise<Program<Tuktuk>> | null = null;
function getTuktukProgram() {
  if (!tuktukProgram) {
    tuktukProgram = init(provider);
  }
  return tuktukProgram;
}

type DcaProgram = Awaited<ReturnType<typeof initTuktukDca>>;
type DcaAccount = Awaited<ReturnType<DcaProgram["account"]["dcaV0"]["fetch"]>>;

let dcaProgram: Promise<DcaProgram> | null = null;
function getDcaProgram() {
  if (!dcaProgram) {
    dcaProgram = initTuktukDca(provider);
  }
  return dcaProgram;
}

/** The task builder for one order of the DCA `dca`, swapping `swapAmount`. */
const prepareTask = async (
  dca: PublicKey,
  dcaAccount: DcaAccount,
  swapAmount: BN
): Promise<BuildDcaTask> => {
  const tuktukProgram = await getTuktukProgram();
  const dcaProgram = await getDcaProgram();
  // answerDcaRequest checked that the request names these.
  const task = dcaAccount.nextTask;
  const taskQueue = dcaAccount.taskQueue;
  const taskQueuedAt = dcaAccount.queuedAt;

  // Get swap payer PDA
  const [swapPayer, bump] = customSignerKey(dcaAccount.taskQueue, [
    Buffer.from("dca_swap_payer"),
  ]);
  const bumpBuffer = Buffer.alloc(1);
  bumpBuffer.writeUint8(bump);

  console.log(
    `DCA ${dca.toBase58()}: Swapping ${swapAmount.toString()} tokens`
  );
  console.log(`Input mint: ${dcaAccount.inputMint.toBase58()}`);
  console.log(`Output mint: ${dcaAccount.outputMint.toBase58()}`);
  console.log("Swap payer", swapPayer.toBase58());

  // Create lend instruction to transfer input tokens
  const lendIx = await dcaProgram.methods
    .lendV0()
    .accounts({
      dca,
      lendDestination: getAssociatedTokenAddressSync(
        dcaAccount.inputMint,
        swapPayer,
        true
      ),
    })
    .instruction();

  // Create check repay instruction
  const checkRepayIx = await dcaProgram.methods
    .checkRepayV0({})
    .accounts({ dca })
    .instruction();

  // The crank turner runs the task with the queue's lookup tables, its own key as payer and
  // unused task ids for the task's free tasks. Only their count changes the size, so random keys
  // stand in for their task accounts: a real task key could match the running task and be
  // counted once.
  const taskAccount = await tuktukProgram.account.taskV0.fetch(task);
  const taskQueueAccount =
    await tuktukProgram.account.taskQueueV0.fetch(taskQueue);
  const freeTaskIds = Array.from(
    { length: taskAccount.freeTasks },
    (_, id) => id
  );
  const lookupTableAccounts = async (keys: PublicKey[]) =>
    (
      await Promise.all(
        keys.map((key) => provider.connection.getAddressLookupTable(key))
      )
    ).flatMap(({ value }) => (value ? [value] : []));
  const queueLookupTables = await lookupTableAccounts(
    taskQueueAccount.lookupTables
  );

  return async (maxBytes: number) => {
    // Build the swap through Jupiter, with the swap payer as the taker
    const swap = await buildJupiterSwap(
      dcaSwapRequest({
        apiUrl: JUPITER_API_URL,
        apiKey: JUPITER_API_KEY,
        dcaAccount,
        swapAmount: swapAmount.toString(),
        swapPayer,
        slippageBps: Number(SLIPPAGE_BPS),
      }),
      fetch,
      maxBytes
    );

    console.log(
      `Jupiter build (maxBytes ${maxBytes}): ${swap.outAmount} output tokens, at least ${
        swap.otherAmountThreshold
      }, via ${swap.routeLabels.join(", ")}`
    );
    console.log("Lookup table addresses", swap.lookupTables);

    const jupiterInstructions = swap.instructions;

    // Setup instructions run with the swap payer PDA as payer, so refuse any that create an account.
    await refuseSetupCreationsOnChain(
      provider.connection,
      swap.setupInstructions
    );

    console.log("Jupiter instructions", jupiterInstructions);

    // Jupiter's route sets return data. `run_task_v0` reads the return data slot after each
    // instruction it invokes and, when the program it invoked is the one that set it, requires
    // the bytes to be a `RunTaskReturnV0` -- so a route invoked directly fails the whole run.
    // Routed through `swap_v0` the route is a child of tuktuk-dca, whose return data is ignored,
    // and `check_repay_v0` remains the only return the run makes.
    const wrappedInstructions = await wrapRoute(
      dcaProgram,
      dca,
      jupiterInstructions
    );
    const instructions = [lendIx, ...wrappedInstructions, checkRepayIx];

    // Compile transaction
    const { transaction, remainingAccounts } = await compileTransaction(
      instructions,
      [[Buffer.from("dca_swap_payer"), bumpBuffer]]
    );

    const remoteTx = new RemoteTaskTransactionV0({
      task,
      taskQueuedAt,
      transaction: {
        ...transaction,
        accounts: remainingAccounts.map((acc) => acc.pubkey),
      },
    });

    const serialized = await RemoteTaskTransactionV0.serialize(
      tuktukProgram.coder.accounts,
      remoteTx
    );
    const signature = Buffer.from(
      sign.detached(Uint8Array.from(serialized), DCA_SIGNER.secretKey)
    );

    const runTaskIx = await tuktukProgram.methods
      .runTaskV0({ freeTaskIds })
      .accountsPartial({
        crankTurner: CRANK_TURNER_STAND_IN,
        rentRefund: taskAccount.rentRefund,
        taskQueue,
        task,
      })
      .remainingAccounts(
        runTaskRemainingAccounts(remainingAccounts, freeTaskIds.length)
      )
      .instruction();
    const size = crankTransactionSize(
      { signer: DCA_SIGNER.publicKey, message: serialized, signature },
      runTaskIx,
      [
        ...queueLookupTables,
        ...(await lookupTableAccounts(
          swap.lookupTables.map((key) => new PublicKey(key))
        )),
      ]
    );
    console.log(
      `DCA ${dca.toBase58()}: crank transaction ${size ?? "over limit"} bytes`
    );

    return {
      task: {
        serialized,
        signature,
        remainingAccounts,
        lookupTables: swap.lookupTables,
      },
      size,
    };
  };
};

const dcaRequestDeps: DcaRequestDeps<DcaAccount> = {
  fetchOrder: async (dca) => (await getDcaProgram()).account.dcaV0.fetch(dca),
  fetchInputBalance: async (dcaAccount) => {
    const inputAccountInfo = await provider.connection.getAccountInfo(
      dcaAccount.inputAccount
    );
    return new BN(inputAccountInfo!.data.slice(64, 72), "le");
  },
  prepareTask,
};

server.post<{
  Body: DcaRequestBody;
  Params: { dcaKey: string };
}>("/dca/:dcaKey", async (request, reply) => {
  const { status, body } = await answerDcaRequest(
    dcaRequestDeps,
    request.params.dcaKey,
    request.body
  );
  reply.status(status).send(body);
});

const start = async () => {
  try {
    const port = Number(PORT);
    await server.listen({
      port,
      host: "0.0.0.0",
    });

    console.log(`DCA service listening on 0.0.0.0:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
