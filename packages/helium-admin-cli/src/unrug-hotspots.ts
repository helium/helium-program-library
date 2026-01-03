import * as anchor from "@coral-xyz/anchor";
import { entityCreatorKey } from "@helium/helium-entity-manager-sdk";
import { daoKey } from "@helium/helium-sub-daos-sdk";
import {
  AssetProof,
  bulkSendRawTransactions,
  bulkSendTransactions,
  getAssetProof,
  HNT_MINT,
  populateMissingDraftInfo,
  searchAssets,
  toVersionedTx,
  TransactionDraft,
  withPriorityFees,
} from "@helium/spl-utils";
import { createTransferInstruction } from "@metaplex-foundation/mpl-bubblegum";
import {
  ConcurrentMerkleTreeAccount,
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
} from "@solana/spl-account-compression";
import {
  AccountMeta,
  Connection,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import bs58 from "bs58";
import os from "os";
import yargs from "yargs/yargs";
import { loadKeypair } from "./utils";

export async function run(args: any = process.argv) {
  const yarg = yargs(args).options({
    ruggedWallet: {
      describe: "Anchor wallet keypair",
      required: true,
      type: "string",
    },
    recipient: {
      describe: "Recipient of the hotspots",
      type: "string",
      required: true,
    },
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
    hntMint: {
      type: "string",
      describe: "HNT mint of the dao to be updated",
      default: HNT_MINT.toBase58(),
    },
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const ruggedWallet = new anchor.Wallet(loadKeypair(argv.ruggedWallet));
  const ruggedWalletKeypair = loadKeypair(argv.ruggedWallet);
  const myKeypair = loadKeypair(argv.wallet);

  const cNFTs = await searchAssets(provider.connection.rpcEndpoint, {
    ownerAddress: ruggedWallet.publicKey.toBase58(),
    limit: 1000,
    creatorVerified: true,
    burnt: false,
    creatorAddress: entityCreatorKey(daoKey(HNT_MINT)[0])[0].toBase58(),
  });
  const drafts: TransactionDraft[] = [];
  for (const cNFT of cNFTs) {
    const draft = await transferCompressedCollectable(
      provider.connection,
      provider.wallet.publicKey,
      cNFT,
      new PublicKey(argv.recipient)
    );
    drafts.push(draft);
  }
  for (const draft of drafts) {
    const tx = await toVersionedTx(
      await populateMissingDraftInfo(provider.connection, draft)
    );
    await tx.sign([ruggedWalletKeypair, myKeypair]);
    await bulkSendRawTransactions(
      provider.connection,
      [Buffer.from(tx.serialize())],
      console.log
    );
  }
}

function getBubblegumAuthorityPDA(merkleRollPubKey: PublicKey) {
  const [bubblegumAuthorityPDAKey] = PublicKey.findProgramAddressSync(
    [merkleRollPubKey.toBuffer()],
    new PublicKey("BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY")
  );
  return bubblegumAuthorityPDAKey;
}

function bufferToArray(buffer: Buffer): number[] {
  const nums: number[] = [];
  for (let i = 0; i < buffer.length; i += 1) {
    nums.push(buffer[i]);
  }
  return nums;
}

const mapProof = (assetProof: AssetProof): AccountMeta[] => {
  if (!assetProof.proof || assetProof.proof.length === 0) {
    throw new Error("Proof is empty");
  }
  return assetProof.proof.map((node) => ({
    pubkey: new PublicKey(node),
    isSigner: false,
    isWritable: false,
  }));
};

const transferCompressedCollectable = async (
  conn: Connection,
  payer: PublicKey,
  collectable: any,
  recipientPubKey: PublicKey
): Promise<TransactionDraft> => {
  const instructions: TransactionInstruction[] = [];

  const assetProof = (await getAssetProof(conn.rpcEndpoint, collectable.id))!;

  const treeAuthority = getBubblegumAuthorityPDA(
    new PublicKey(assetProof.treeId)
  );

  const leafDelegate = collectable.ownership.delegate
    ? new PublicKey(collectable.ownership.delegate)
    : new PublicKey(collectable.ownership.owner);

  const merkleTree = new PublicKey(assetProof.treeId);

  const tree = await ConcurrentMerkleTreeAccount.fromAccountAddress(
    conn,
    merkleTree,
    "confirmed"
  );

  const canopyHeight = tree.getCanopyDepth();
  const proofPath = mapProof(assetProof);

  const anchorRemainingAccounts = proofPath.slice(
    0,
    proofPath.length - (canopyHeight || 0)
  );

  const ix = createTransferInstruction(
    {
      treeAuthority,
      leafOwner: new PublicKey(collectable.ownership.owner),
      leafDelegate,
      newLeafOwner: recipientPubKey,
      merkleTree,
      logWrapper: SPL_NOOP_PROGRAM_ID,
      compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
      anchorRemainingAccounts,
    },
    {
      root: bufferToArray(assetProof.root.toBuffer()),
      dataHash: bufferToArray(
        Buffer.from(bs58.decode(collectable.compression.data_hash.trim()))
      ),
      creatorHash: bufferToArray(
        Buffer.from(bs58.decode(collectable.compression.creator_hash.trim()))
      ),
      nonce: collectable.compression.leaf_id,
      index: collectable.compression.leaf_id,
    }
  );
  ix.keys[1].isSigner = true;
  instructions.push(ix);

  return {
    instructions: await withPriorityFees({
      connection: conn,
      instructions,
      feePayer: payer,
    }),
    feePayer: payer,
  };
};
