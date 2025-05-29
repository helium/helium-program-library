import * as anchor from "@coral-xyz/anchor";
import { init as initVsr } from "@helium/voter-stake-registry-sdk";
import os from "os";
import yargs from "yargs";
import { Connection, PublicKey } from "@solana/web3.js";
import fs from "fs";
import { AccountLayout } from "@solana/spl-token";

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
    output: {
      alias: "o",
      describe: "Output file path for staked wallets",
      type: "string",
      demandOption: true,
    },
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const connection = new Connection(argv.url);

  console.log("Initializing VSR program...");
  const vsrProgram = await initVsr(provider);

  console.log("Fetching all positions...");
  const positions = await vsrProgram.account.positionV0.all();
  console.log(`Found ${positions.length} total positions`);

  // Get unique mints from positions
  const mints = [...new Set(positions.filter(p => p.account.lockup.kind.constant || p.account.lockup.endTs.gte(new anchor.BN(Date.now() / 1000))).map(p => p.account.mint.toString()))];
  console.log(`Found ${mints.length} unique mints to process`);

  // Get token accounts for each mint and extract owner addresses
  const stakedWallets = new Set<string>();

  const batchSize = 10;
  // Process mints in batches of batchSize
  for (let i = 0; i < mints.length; i += batchSize) {
    const mintBatch = mints.slice(i, i + batchSize);
    const tokenAccountsPromises = mintBatch.map(mint => 
      connection.getTokenLargestAccounts(new PublicKey(mint))
    );
    
    const tokenAccountsResults = await Promise.all(tokenAccountsPromises);
    
    // Collect all token account addresses
    const tokenAccountAddresses: PublicKey[] = [];
    tokenAccountsResults.forEach(result => {
      result.value.forEach(account => {
        tokenAccountAddresses.push(account.address);
      });
    });

    // Fetch all token accounts in one batch
    const tokenAccountsInfo = await connection.getMultipleAccountsInfo(tokenAccountAddresses);
    
    // Parse token accounts and extract owners
    tokenAccountsInfo.forEach((accountInfo, index) => {
      if (accountInfo) {
        try {
          const tokenAccount = AccountLayout.decode(accountInfo.data);
          stakedWallets.add(tokenAccount.owner.toString());
        } catch (e) {
          console.error(`Failed to parse token account at index ${index}`);
        }
      }
    });

    console.log(`Processed ${i / batchSize} of ${mints.length / batchSize} batches`);
  }

  // Convert Set to Array and write to file
  const stakedWalletsArray = Array.from(stakedWallets);
  console.log(`\nWriting ${stakedWalletsArray.length} unique staked wallets to ${argv.output}`);
  fs.writeFileSync(argv.output, JSON.stringify(stakedWalletsArray, null, 2));

  console.log("Done!");
}
