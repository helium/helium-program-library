import { PublicKey } from "@solana/web3.js";
import axios from "axios";
// @ts-ignore
import base58 from "bs58";

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
      return toAsset(result);
    }
  } catch (error) {
    console.error(error);
    throw error;
  }
}

function toAsset(result: any): Asset {
  return {
    ...result,
    id: new PublicKey(result.id),
    compression: {
      ...result.compression,
      dataHash:
        result.compression.data_hash ??
        base58.decode(result.compression.data_hash),
      creatorHash:
        result.compression.creator_hash ??
        base58.decode(result.compression.creator_hash),
      assetHash:
        result.compression.asset_hash ??
        base58.decode(result.compression.asset_hash),
      tree: result.compression.tree ?? base58.decode(result.compression.tree),
    },
    ownership: {
      ...result.ownership,
      owner: result.ownership.owner ?? new PublicKey(result.ownership.owner),
    },
  };
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

    return response.data.result?.items.map(toAsset);
  } catch (error) {
    console.error(error);
    throw error;
  }
}

