import * as anchor from "@coral-xyz/anchor";
import { init as initHex, boostConfigKey } from "@helium/hexboosting-sdk";
import {
  batchInstructionsToTxsWithPriorityFee,
  bulkSendTransactions,
  MOBILE_MINT,
} from "@helium/spl-utils";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import { loadKeypair, getUnixTimestamp } from "./utils";

const JULY_FIRST_2025 = 1751328000;

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
    dntMint: {
      type: "string",
      describe: "DNT mint whose boost config to process",
      default: MOBILE_MINT.toBase58(),
    },
    commit: {
      type: "boolean",
      describe: "Actually send transactions. Otherwise dry-run",
      default: false,
    },
  });
  const argv = await yarg.argv;

  process.env.ANCHOR_WALLET = argv.wallet as string;
  process.env.ANCHOR_PROVIDER_URL = argv.url as string;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url as string));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  // Ensure wallet is loaded for signing
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const wallet = new anchor.Wallet(loadKeypair(argv.wallet as string));

  const program = await initHex(provider);

  const dntMint = new PublicKey(argv.dntMint as string);
  const [boostConfigPubkey] = boostConfigKey(dntMint);

  // Fetch boost config for parameters (period length, rent reclaim authority)
  const boostConfig = await program.account.boostConfigV0.fetch(
    boostConfigPubkey
  );

  // Verify signer matches rent reclaim authority to avoid signature failures on commit
  if (argv.commit && !provider.wallet.publicKey.equals(boostConfig.rentReclaimAuthority)) {
    console.log(
      `Wallet ${provider.wallet.publicKey.toBase58()} is not the rent reclaim authority (${boostConfig.rentReclaimAuthority.toBase58()}). Aborting. Use the correct wallet.`
    );
    process.exit(1);
  }

  // Get on-chain unix timestamp to match program semantics
  const nowBig = await getUnixTimestamp(provider);
  const now = Number(nowBig);

  const boostedHexes = await program.account.boostedHexV0.all()

  const periodLength = Number(boostConfig.periodLength);

  function isExpired(hexAcc: any): boolean {
    const startTs = Number(hexAcc.startTs);
    if (startTs === 0) {
      return now >= JULY_FIRST_2025;
    }
    const elapsedTime = now - startTs;
    const elapsedPeriods = Math.floor(elapsedTime / periodLength);
    const boostsLen = (hexAcc.boostsByPeriod as Buffer).length;
    return startTs >= JULY_FIRST_2025 || boostsLen <= elapsedPeriods;
  }

  const expired = boostedHexes.filter((bh) => isExpired(bh.account));
  console.log(
    `Found ${boostedHexes.length} boosted hexes for config ${boostConfigPubkey.toBase58()}, ${expired.length} expired`
  );

  if (!expired.length) {
    console.log("No expired boosted hexes to close");
    return;
  }

  // Form close instructions
  const instructions: TransactionInstruction[] = [];
  let i = 0;
  for (const { publicKey } of expired) {
    if (i > 0 && i % 100 === 0) {
      console.log(`Prepared ${i} close instructions`);
    }
    i++;
    instructions.push(
      await program.methods
        .closeBoostV0()
        .accountsStrict({
          rentReclaimAuthority: boostConfig.rentReclaimAuthority,
          boostConfig: boostConfigPubkey,
          boostedHex: publicKey,
        })
        .instruction()
    );
  }

  if (!argv.commit) {
    console.log(
      `Dry run: would close ${instructions.length} boosted hexes. Re-run with --commit to execute.`
    );
    return;
  }

  const txns = await batchInstructionsToTxsWithPriorityFee(
    provider,
    instructions,
    {
      useFirstEstimateForAll: true,
      computeUnitLimit: 600000,
    }
  );

  await bulkSendTransactions(provider, txns, (status) => {
    console.log(
      `Sending ${status.currentBatchProgress} / ${status.currentBatchSize} in batch. ${status.totalProgress} / ${txns.length}`
    );
  });
  console.log("Done");
}

