import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider } from "@coral-xyz/anchor";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import {
  init as initHem
} from "@helium/helium-entity-manager-sdk";
import {
  init as initMem
} from "@helium/mobile-entity-manager-sdk";
import { concurrentMerkleTreeBeetFactory, concurrentMerkleTreeHeaderBeet, getCanopyDepth, getConcurrentMerkleTreeAccountSize } from "@solana/spl-account-compression";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import yargs from "yargs";
import os from "os";
import { AccountInfo } from "@solana/web3.js";

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

  const provider = anchor.getProvider() as anchor.AnchorProvider;

  const hemProgram = await initHem(provider);
  const memProgram = await initMem(provider);

  // Get all MakerV0 accounts
  const makers = await hemProgram.account.makerV0.all();

  // Get all carriers
  const carriers = await memProgram.account.carrierV0.all();

  // Get data only config accounts
  const dataOnlyConfigs = await hemProgram.account.dataOnlyConfigV0.all();

  const merkleDepths: { [key: string]: number } = {};

  // Function to calculate merkle tree depth
  const getMerkleTreeDepth = (account: AccountInfo<Buffer>): number => {
    let offset = 0;
    const buffer = account.data;
    const [versionedHeader, offsetIncr] =
      concurrentMerkleTreeHeaderBeet.deserialize(buffer);
    offset = offsetIncr;

    // Only 1 version available
    if (versionedHeader.header.__kind !== "V1") {
      throw Error(
        `Header has unsupported version: ${versionedHeader.header.__kind}`
      );
    }
    const header = versionedHeader.header.fields[0];
    const [_, offsetIncr2] = concurrentMerkleTreeBeetFactory(
      header.maxDepth,
      header.maxBufferSize
    ).deserialize(buffer, offset);
    offset = offsetIncr2;

    return getCanopyDepth(buffer.byteLength - offset);
  };

  // Get depths for all maker merkle trees
  for (const maker of makers) {
    const merkleAccount = await provider.connection.getAccountInfo(maker.account.merkleTree);
    if (merkleAccount) {
      merkleDepths[maker.account.merkleTree.toBase58()] = getMerkleTreeDepth(merkleAccount);
    }
  }

  // Get depths for all carrier merkle trees
  for (const carrier of carriers) {
    const merkleAccount = await provider.connection.getAccountInfo(carrier.account.merkleTree);
    if (merkleAccount) {
      merkleDepths[carrier.account.merkleTree.toBase58()] = getMerkleTreeDepth(merkleAccount);
    }
  }

  // Get depths for all data only config merkle trees
  for (const config of dataOnlyConfigs) {
    const merkleAccount = await provider.connection.getAccountInfo(config.account.merkleTree);
    if (merkleAccount) {
      merkleDepths[config.account.merkleTree.toBase58()] = getMerkleTreeDepth(merkleAccount);
    }
  }

  // Output results as JSON
  console.log(JSON.stringify(merkleDepths, null, 2));
}
