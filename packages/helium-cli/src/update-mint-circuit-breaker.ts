import * as anchor from "@coral-xyz/anchor";
import { init } from "@helium/circuit-breaker-sdk";
import { PublicKey } from "@solana/web3.js";
import { BN } from "bn.js";
import os from "os";
import yargs from "yargs/yargs";
import { loadKeypair, sendInstructionsOrCreateProposal } from "./utils";

const { hideBin } = require("yargs/helpers");
const yarg = yargs(hideBin(process.argv)).options({
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
  circuitBreaker: {
    type: "string",
    required: true,
    describe:
      "Circuit breaker account",
  },
  windowSizeSeconds: {
    type: "number",
  },
  threshold: {
    type: "number"
  },
  govProgramId: {
    type: "string",
    describe: "Pubkey of the GOV program",
    default: "hgovkRU6Ghe1Qoyb54HdSLdqN7VtxaifBzRmh9jtd3S",
  },
  councilKey: {
    type: "string",
    describe: "Key of gov council token",
    default: "counKsk72Jgf9b3aqyuQpFf12ktLdJbbuhnoSxxQoMJ",
  },
  executeProposal: {
    type: "boolean",
  },
});

async function run() {
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const councilKey = new PublicKey(argv.councilKey);
  const circuitBreakerKey = new PublicKey(argv.circuitBreaker)
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const circuitBreakerProgram = await init(provider);

  const instructions = []
  const circuitBreaker = await circuitBreakerProgram.account.mintWindowedCircuitBreakerV0.fetch(circuitBreakerKey)
  instructions.push(
    await circuitBreakerProgram.methods.updateMintWindowedBreakerV0({
      newAuthority: circuitBreaker.authority,
      config: {
        windowSizeSeconds: argv.windowSizeSeconds ? new BN(argv.windowSizeSeconds) : circuitBreaker.config.windowSizeSeconds,
        thresholdType: circuitBreaker.config.thresholdType,
        threshold: argv.threshold ? new BN(argv.threshold) : circuitBreaker.config.threshold,
      }
    })
    .accounts({
      circuitBreaker: circuitBreakerKey,
      authority: circuitBreaker.authority,
    })
    .instruction()
  )

  const wallet = loadKeypair(argv.wallet);
  await sendInstructionsOrCreateProposal({
    provider,
    instructions,
    walletSigner: wallet,
    signers: [],
    govProgramId: new PublicKey(argv.govProgramId),
    proposalName: `Update circuit breaker config`,
    votingMint: councilKey,
    executeProposal: argv.executeProposal,
  });
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit());
