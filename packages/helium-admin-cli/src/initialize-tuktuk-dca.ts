import * as anchor from "@coral-xyz/anchor";
import { dcaKey, init as initTuktukDca, queueAuthorityKey } from "@helium/tuktuk-dca-sdk";
import { init as initTuktuk, nextAvailableTaskIds, taskKey, taskQueueAuthorityKey } from "@helium/tuktuk-sdk";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import { loadKeypair, sendInstructionsOrSquadsV4 } from "./utils";

const TASK_QUEUE_ID = new PublicKey("HMBp68hMkHAr574nmckmS93p2RSZL5N4NMavhmFApwjF");

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
    inputMint: {
      type: "string",
      describe: "Pubkey of the input token mint",
      required: true,
    },
    outputMint: {
      type: "string",
      describe: "Pubkey of the output token mint",
      required: true,
    },
    destinationWallet: {
      type: "string",
      describe: "Pubkey of the destination wallet",
      required: true,
    },
    numOrders: {
      type: "number",
      describe: "Number of DCA orders",
      required: true,
    },
    swapAmountPerOrder: {
      type: "number",
      describe: "Amount to swap per order (in token units)",
      required: true,
    },
    intervalSeconds: {
      type: "number",
      describe: "Interval between orders in seconds",
      required: true,
    },
    slippageBps: {
      type: "number",
      describe: "Slippage tolerance in basis points (e.g., 50 for 0.5%)",
      default: 50,
    },
    inputPriceOracle: {
      type: "string",
      describe: "Pubkey of the input price oracle",
      required: true,
    },
    outputPriceOracle: {
      type: "string",
      describe: "Pubkey of the output price oracle",
      required: true,
    },
    dcaSigner: {
      type: "string",
      describe: "Pubkey of the DCA signer",
      required: true,
    },
    dcaUrl: {
      type: "string",
      describe: "URL of the DCA service",
      required: true,
    },
    crankReward: {
      type: "number",
      describe: "Crank reward in lamports",
      default: 20000,
    },
    multisig: {
      type: 'string',
      describe:
        'Address of the squads multisig to be authority. If not provided, your wallet will be the authority',
    },
    initialLamports: {
      type: "number",
      describe: "Initial lamports to send to the DCA account for rent",
      default: 10000000,
    },
  });

  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const tuktukDcaProgram = await initTuktukDca(provider);
  const tuktukProgram = await initTuktuk(provider);

  const wallet = new anchor.Wallet(loadKeypair(argv.wallet));
  let authority = provider.wallet.publicKey;
  let multisigPda = argv.multisig ? new PublicKey(argv.multisig) : null;
  if (multisigPda) {
    const { getVaultPda } = await import('@sqds/multisig');
    const [vaultPda] = getVaultPda({
      multisigPda,
      index: 0,
    });
    authority = vaultPda;
  }

  const inputMint = new PublicKey(argv.inputMint);
  const outputMint = new PublicKey(argv.outputMint);
  const destinationWallet = new PublicKey(argv.destinationWallet);
  const inputPriceOracle = new PublicKey(argv.inputPriceOracle);
  const outputPriceOracle = new PublicKey(argv.outputPriceOracle);
  const dcaSigner = new PublicKey(argv.dcaSigner);

  // Get destination token account
  const destinationTokenAccount = getAssociatedTokenAddressSync(
    outputMint,
    destinationWallet,
    true
  );

  // Get task queue and find available task IDs
  const taskQueue = await tuktukProgram.account.taskQueueV0.fetch(TASK_QUEUE_ID);
  const [nextTask] = nextAvailableTaskIds(taskQueue.taskBitmap, 1);


  const instructions: TransactionInstruction[] = [];

  const dcaPda = dcaKey(authority, inputMint, outputMint, 0)[0];
  const dcaPdaExists = await tuktukDcaProgram.account.dcaV0.fetchNullable(dcaPda);
  if (dcaPdaExists) {
    console.log(`DCA already initialized at: ${dcaPda.toBase58()}, closing it...`);
    const { instruction: closeDcaIx } = await tuktukDcaProgram.methods
      .closeDcaV0()
      .accounts({ dca: dcaPda })
      .prepare();
    await sendInstructionsOrSquadsV4({
      provider,
      instructions: [closeDcaIx],
      multisig: multisigPda!,
      signers: [],
    });
  }

  // Initialize DCA
  const { instruction: initDcaIx, pubkeys: { core } } = await tuktukDcaProgram.methods
    .initializeDcaV0({
      index: 0,
      numOrders: argv.numOrders,
      swapAmountPerOrder: new anchor.BN(argv.swapAmountPerOrder),
      intervalSeconds: new anchor.BN(argv.intervalSeconds),
      slippageBpsFromOracle: argv.slippageBps,
      taskId: nextTask,
      dcaSigner,
      dcaUrl: argv.dcaUrl,
      crankReward: new anchor.BN(argv.crankReward),
    })
    .accountsPartial({
      core: {
        rentPayer: authority,
        dcaPayer: authority,
        authority,
        inputMint,
        outputMint,
        destinationTokenAccount,
        inputPriceOracle,
        outputPriceOracle,
        taskQueue: TASK_QUEUE_ID,
      },
      queueAuthority: queueAuthorityKey()[0],
      taskQueueAuthority: taskQueueAuthorityKey(TASK_QUEUE_ID, queueAuthorityKey()[0])[0],
      task: taskKey(TASK_QUEUE_ID, nextTask)[0],
    })
    .prepare();


  const dca = core?.dca!;
  instructions.push(initDcaIx);

  // Fund the DCA account with initial lamports
  instructions.push(
    SystemProgram.transfer({
      fromPubkey: authority,
      toPubkey: dca,
      lamports: argv.initialLamports,
    })
  );

  await sendInstructionsOrSquadsV4({
    provider,
    instructions,
    multisig: multisigPda!,
    signers: [],
  });

  console.log(`✅ Initialized Tuktuk DCA at: ${dca.toBase58()}`);
  console.log(`📊 Configuration:`);
  console.log(`   - Input Mint: ${inputMint.toBase58()}`);
  console.log(`   - Output Mint: ${outputMint.toBase58()}`);
  console.log(`   - Destination: ${destinationWallet.toBase58()}`);
  console.log(`   - Orders: ${argv.numOrders}`);
  console.log(`   - Amount per order: ${argv.swapAmountPerOrder}`);
  console.log(`   - Interval: ${argv.intervalSeconds} seconds`);
  console.log(`   - Slippage: ${argv.slippageBps} bps`);
  console.log(`   - DCA Signer: ${dcaSigner.toBase58()}`);
  console.log(`   - DCA URL: ${argv.dcaUrl}`);
}

if (require.main === module) {
  run();
}
