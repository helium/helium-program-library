import {
  AccountMeta,
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { Asset, AssetProof, getAssetProof } from "@helium/spl-utils";
import {
  PROGRAM_ID as BUBBLEGUM_PROGRAM_ID,
  createTransferInstruction,
} from "@metaplex-foundation/mpl-bubblegum";
import {
  ConcurrentMerkleTreeAccount,
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
} from "@solana/spl-account-compression";

const getBubblegumAuthorityPDA = async (merkleRollPubKey: PublicKey) => {
  const [bubblegumAuthorityPDAKey] = await PublicKey.findProgramAddress(
    [merkleRollPubKey.toBuffer()],
    BUBBLEGUM_PROGRAM_ID
  );
  return bubblegumAuthorityPDAKey;
};

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

export const createTransferCompressedCollectableTxn = async ({
  collectable,
  owner,
  recipient,
  connection,
  url,
}: {
  collectable: Asset;
  owner: PublicKey;
  recipient: PublicKey;
  connection: Connection;
  url: string;
}): Promise<VersionedTransaction | undefined> => {
  const instructions: TransactionInstruction[] = [];

  const assProof = await getAssetProof(url, collectable.id);
  if (!assProof) {
    throw new Error("");
  }

  const treeAuthority = await getBubblegumAuthorityPDA(
    new PublicKey(assProof.treeId)
  );

  const leafDelegate = collectable.ownership.owner;
  const merkleTree = new PublicKey(assProof.treeId);
  const tree = await ConcurrentMerkleTreeAccount.fromAccountAddress(
    connection,
    merkleTree,
    "confirmed"
  );
  const canopyHeight = tree.getCanopyDepth();
  const proofPath = mapProof(assProof);
  const anchorRemainingAccounts = proofPath.slice(
    0,
    proofPath.length - (canopyHeight || 0)
  );
  instructions.push(
    createTransferInstruction(
      {
        treeAuthority,
        leafOwner: new PublicKey(collectable.ownership.owner),
        leafDelegate,
        newLeafOwner: recipient,
        merkleTree,
        logWrapper: SPL_NOOP_PROGRAM_ID,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
        anchorRemainingAccounts,
      },
      {
        root: [...assProof.root.toBuffer()],
        dataHash: [...collectable.compression.dataHash],
        creatorHash: [...collectable.compression.creatorHash],
        nonce: collectable.compression.leafId,
        index: collectable.compression.leafId,
      }
    )
  );

  const { blockhash } = await connection.getLatestBlockhash();
  const messageV0 = new TransactionMessage({
    payerKey: owner,
    recentBlockhash: blockhash,
    instructions,
  }).compileToLegacyMessage();
  return new VersionedTransaction(
    VersionedMessage.deserialize(messageV0.serialize())
  );
};
