import {
  AccountMeta,
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  Asset,
  AssetProof,
  getAssetProof,
  IOT_MINT,
  MOBILE_MINT,
} from "@helium/spl-utils";
import {
  PROGRAM_ID as BUBBLEGUM_PROGRAM_ID,
  createTransferInstruction,
} from "@metaplex-foundation/mpl-bubblegum";
import {
  ConcurrentMerkleTreeAccount,
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
} from "@solana/spl-account-compression";
import { subDaoKey } from "@helium/helium-sub-daos-sdk";
import {
  iotInfoKey,
  mobileInfoKey,
  rewardableEntityConfigKey,
} from "@helium/helium-entity-manager-sdk";
import { Program } from "@coral-xyz/anchor";
import { HeliumEntityManager } from "@helium/idls/lib/types/helium_entity_manager";

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

export const createTransferInstructions = async ({
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
}) => {
  const instructions: TransactionInstruction[] = [];

  const assProof = await getAssetProof(url, collectable.id);
  if (!assProof) {
    throw new Error("Asset not found");
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
        dataHash: [...(collectable.compression.dataHash || [])],
        creatorHash: [...(collectable.compression.creatorHash || [])],
        nonce: collectable.compression.leafId!,
        index: collectable.compression.leafId!,
      }
    )
  );

  return instructions;
};

export const createTransferCompressedCollectableTxn = async (opts: {
  collectable: Asset;
  owner: PublicKey;
  recipient: PublicKey;
  connection: Connection;
  url: string;
}): Promise<VersionedTransaction | undefined> => {
  const instructions = await createTransferInstructions(opts);

  const { blockhash } = await opts.connection.getLatestBlockhash();
  const messageV0 = new TransactionMessage({
    payerKey: opts.owner,
    recentBlockhash: blockhash,
    instructions,
  }).compileToLegacyMessage();
  return new VersionedTransaction(
    VersionedMessage.deserialize(messageV0.serialize())
  );
};

export const getHotspotDetails = async ({
  hemProgram,
  address,
  type,
}: {
  hemProgram: Program<HeliumEntityManager>;
  address: string;
  type: "MOBILE" | "IOT";
}) => {
  const mint = type === "IOT" ? IOT_MINT : MOBILE_MINT;
  const subDao = subDaoKey(mint)[0];

  const configKey = rewardableEntityConfigKey(subDao, type);

  const entityConfig =
    await hemProgram.account.rewardableEntityConfigV0.fetchNullable(
      configKey[0]
    );
  if (!entityConfig) return;

  if (type === "IOT") {
    const [info] = await iotInfoKey(configKey[0], address);
    return hemProgram.account.iotHotspotInfoV0.fetch(info);
  }

  const [info] = await mobileInfoKey(configKey[0], address);
  return hemProgram.account.mobileHotspotInfoV0.fetch(info);
};
