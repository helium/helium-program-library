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
    leafId?: number;
  };
  ownership: {
    owner: PublicKey;
  };
};

export async function getAsset(
  url: string,
  assetId: PublicKey
): Promise<Asset | undefined> {
  try {
    const response = await axios.post(url, {
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
          dataHash:
            result.compression.dataHash ??
            new PublicKey(result.compression.dataHash).toBase58(),
          creatorHash:
            result.compression.creatorHash ??
            new PublicKey(result.compression.creatorHash).toBase58(),
          assetHash:
            result.compression.assetHash ??
            new PublicKey(result.compression.assetHash).toBase58(),
          tree:
            result.compression.tree ??
            new PublicKey(result.compression.tree).toBase58(),
        },
        ownership: {
          ...result.ownership,
          owner: new PublicKey(result.ownership.owner),
        },
      };
    }
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function getAssetProof(
  url: string,
  assetId: PublicKey
): Promise<AssetProof | undefined> {
  try {
    const response = await axios.post(url, {
      jsonrpc: "2.0",
      method: "get_asset_proof",
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


export type AssetsByOwnerOpts = {
  sortBy?: any;
  limit?: number;
  page?: number;
  before?: string;
  after?: string;
}

export async function getAssetsByOwner(
  url: string,
  wallet: string,
  {
    sortBy = "created",
    limit = 50,
    page = 0,
    before = "",
    after = "",
  }: AssetsByOwnerOpts = {}
): Promise<Asset[]> {
  try {
    const response = await axios.post(url, {
      jsonrpc: "2.0",
      method: "get_assets_by_owner",
      id: "rpd-op-123",
      params: [wallet, sortBy, limit, page, before, after],
    });

    return response.data.result?.items;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

