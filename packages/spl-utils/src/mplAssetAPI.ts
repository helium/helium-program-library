import { Creator, Uses } from "@metaplex-foundation/mpl-bubblegum";
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
    delegate: PublicKey;
  };
  royalty: {
    basis_points: number;
    primary_sale_happened: boolean;
  };
  mutable: boolean;
  supply: {
    edition_nonce: number | null;
  };
  grouping?: PublicKey;
  uses?: Uses;
  creators: Creator[];
};

export async function getAsset(
  url: string,
  assetId: PublicKey
): Promise<Asset | undefined> {
  try {
    const response = await axios.post(url, {
      jsonrpc: "2.0",
      method: "getAsset",
      id: "rpd-op-123",
      params: { id: assetId.toBase58() },
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        Expires: "0",
      },
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
    grouping: result.grouping && new PublicKey(result.grouping),
    compression: {
      ...result.compression,
      leafId: result.compression.leaf_id,
      dataHash:
        result.compression.data_hash &&
        Buffer.from(base58.decode(result.compression.data_hash)),
      creatorHash:
        result.compression.creator_hash &&
        Buffer.from(base58.decode(result.compression.creator_hash)),
      assetHash:
        result.compression.asset_hash &&
        Buffer.from(base58.decode(result.compression.asset_hash)),
      tree: result.compression.tree && new PublicKey(result.compression.tree),
    },
    ownership: {
      ...result.ownership,
      delegate: result.ownership.delegate && new PublicKey(result.ownership.delegate),
      owner: result.ownership.owner && new PublicKey(result.ownership.owner),
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
      method: "getAssetProof",
      id: "rpd-op-123",
      params: { id: assetId.toBase58() },
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        Expires: "0",
      },
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
  sortBy?: { sortBy: "created"; sortDirection: "asc" | "desc" };
  limit?: number;
  page?: number;
  before?: string;
  after?: string;
};

export async function getAssetsByOwner(
  url: string,
  wallet: string,
  {
    sortBy = { sortBy: "created", sortDirection: "asc" },
    limit = 50,
    page = 1,
    before = "",
    after = "",
  }: AssetsByOwnerOpts = {}
): Promise<Asset[]> {
  try {
    const response = await axios.post(url, {
      jsonrpc: "2.0",
      method: "getAssetsByOwner",
      id: "rpd-op-123",
      params: [wallet, sortBy, limit, page, before, after],
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        Expires: "0",
      },
    });

    return response.data.result?.items.map(toAsset);
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export type SearchAssetsOpts = {
  sortBy?: { sortBy: "created"; sortDirection: "asc" | "desc" };
  page?: number;
  collection?: string;
  ownerAddress: string;
  creatorAddress: string;
  creatorVerified?: boolean;
} & { [key: string]: unknown };

export async function searchAssets(
  url: string,
  {
    creatorVerified = true,
    sortBy = { sortBy: "created", sortDirection: "asc" },
    page = 1,
    ...rest
  }: SearchAssetsOpts
): Promise<Asset[]> {
  try {
    const response = await axios.post(url, {
      jsonrpc: "2.0",
      method: "searchAssets",
      id: "get-assets-op-1",
      params: {
        page,
        creatorVerified,
        sortBy,
        ...rest,
      },
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        Expires: "0",
      },
    });

    return response.data.result?.items.map(toAsset);
  } catch (error) {
    console.error(error);
    throw error;
  }
}
