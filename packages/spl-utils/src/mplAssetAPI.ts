import { PublicKey } from "@solana/web3.js";
import axios from "axios";

export type AssetProof = {
  root: PublicKey;
  proof: PublicKey[];
  nodeIndex: number;
  leaf: PublicKey;
  treeId: PublicKey;
};

export type Asset = {
  id: PublicKey;
  content: any;
  compression: {
    eligible: boolean;
    compressed: boolean;
    dataHash?: Buffer;
    creatorHash?: Buffer;
    assetHash?: Buffer;
    tree?: PublicKey;
    leafId?: number
  },
  ownership: {
    owner: PublicKey;
  }
}

export async function getAsset(assetId: PublicKey): Promise<Asset | undefined> {
  try {
    const response = await axios.post("get_asset", {
      jsonrpc: "2.0",
      method: "get_asset",
      id: "rpd-op-123",
      params: [assetId.toBase58()],
    });
    const result = response.data.result;
    if (result) {
      return {
        ...result,
        id: new PublicKey(result.id),
        compression: {
          ...result.compression,
          dataHash: result.compression.dataHash ?? new PublicKey(result.compression.dataHash).toBase58(),
          creatorHash: result.compression.creatorHash ?? new PublicKey(result.compression.creatorHash).toBase58(),
          assetHash: result.compression.assetHash ?? new PublicKey(result.compression.assetHash).toBase58(),
          tree: result.compression.tree ?? new PublicKey(result.compression.tree).toBase58(),
        },
        ownership: {
          ...result.ownership,
          owner: new PublicKey(result.ownership.owner)
        }
      };
    }
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function getAssetProof(
  assetId: PublicKey
): Promise<AssetProof | undefined> {
  try {
    const response = await axios.post("get_asset", {
      jsonrpc: "2.0",
      method: "get_asset",
      id: "rpd-op-123",
      params: [assetId.toBase58()],
    });
    const result = response.data.result;
    if (result) {
      return {
        root: new PublicKey(result.root),
        proof: result.proof.map((p: any) => new PublicKey(p)),
        nodeIndex: result.node_index,
        leaf: new PublicKey(result.leaf),
        treeId: new PublicKey(result.tree_id),
      };
    }
  } catch (error) {
    console.error(error);
    throw error;
  }
}
