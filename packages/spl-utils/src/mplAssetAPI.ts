import { Creator, Uses } from "@metaplex-foundation/mpl-bubblegum";
import { collectInstructionDiscriminator } from "@metaplex-foundation/mpl-token-metadata";
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
  grouping?: { group_key: string; group_value: PublicKey }[];
  uses?: Uses;
  creators: Creator[];
  burnt: boolean;
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

    if (response.data && response.data.error) {
      throw new Error(response.data.error.message);
    }

    const result = response.data.result;
    if (result) {
      return toAsset(result);
    }
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function getAssetBatch(
  url: string,
  assetIds: PublicKey[]
): Promise<Asset[] | undefined> {
  try {
    const response = await axios.post(url, {
      jsonrpc: "2.0",
      method: "getAssetBatch",
      id: "rpd-op-123",
      params: { ids: assetIds.map((assetId) => assetId.toBase58()) },
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        Expires: "0",
      },
    });

    if (response.data && response.data.error) {
      throw new Error(response.data.error.message);
    }

    const result = response.data.result;

    return [
      ...(result
        ? result.map((x: Asset | undefined) => (x ? toAsset(x) : x))
        : []),
    ];
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function getAssets(
  url: string,
  assetIds: PublicKey[]
): Promise<(Asset | undefined)[]> {
  try {
    if (assetIds.length > 1000) {
      throw new Error(
        `Can only batch 1000 at a time, was given ${assetIds.length}`
      );
    }

    const batch = assetIds.map((assetId, i) => ({
      jsonrpc: "2.0",
      id: `get-asset-${i}`,
      method: "getAsset",
      params: {
        id: assetId.toBase58(),
      },
    }));

    const response = await axios({
      url,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        Expires: "0",
      },
      data: JSON.stringify(batch),
    });

    if (response.data && response.data.error) {
      throw new Error(response.data.error.message);
    }

    const result = response.data
      ? response.data.map((res: any) => res?.result || undefined)
      : [];

    return [
      ...(result
        ? result.map((x: Asset | undefined) => (x ? toAsset(x) : x))
        : []),
    ];
  } catch (error) {
    console.error(error);
    throw error;
  }
}

function toAsset(result: any): Asset {
  return {
    ...result,
    creators: result.creators.map(
      ({
        address,
        share,
        verified,
      }: {
        address: string;
        share: number;
        verified: boolean;
      }) => ({
        share,
        verified,
        address: address && new PublicKey(address),
      })
    ),
    id: new PublicKey(result.id),
    grouping:
      result.grouping &&
      result.grouping.map((g: any) => ({
        ...g,
        group_value: new PublicKey(g.group_value),
      })),
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
      delegate:
        result.ownership.delegate && new PublicKey(result.ownership.delegate),
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

    if (response.data && response.data.error) {
      throw new Error(response.data.error.message);
    }

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

export async function getAssetProofBatch(
  url: string,
  assetIds: PublicKey[]
): Promise<Record<string, AssetProof> | undefined> {
  try {
    const response = await axios.post(url, {
      jsonrpc: "2.0",
      method: "getAssetProofBatch",
      id: "rpd-op-123",
      params: { ids: assetIds.map((assetId) => assetId.toBase58()) },
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        Expires: "0",
      },
    });

    if (response.data && response.data.error) {
      throw new Error(response.data.error.message);
    }

    const result = response.data.result;
    if (result) {
      return Object.entries(result as Record<string, any>).reduce(
        (acc, [k, r]) => {
          acc[k] = {
            root: new PublicKey(r.root),
            proof: r.proof.map((p: any) => new PublicKey(p)),
            nodeIndex: r.node_index,
            leaf: new PublicKey(r.leaf),
            treeId: new PublicKey(r.tree_id),
          } as AssetProof;
          return acc;
        },
        {} as Record<string, AssetProof>
      );
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

export async function getAssetsByOwnerWithPageInfo(
  url: string,
  wallet: string,
  {
    sortBy = { sortBy: "created", sortDirection: "asc" },
    limit = 50,
    page = 1,
    before = "",
    after = "",
  }: AssetsByOwnerOpts = {}
): Promise<{
  page: number;
  total: number;
  limit: number;
  items: Asset[];
  before?: string;
  after?: string;
}> {
  try {
    const response = await axios.post(url, {
      jsonrpc: "2.0",
      method: "getAssetsByOwner",
      id: "get-assets-by-owner",
      params: [wallet, sortBy, limit, page, before, after],
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        Expires: "0",
      },
    });

    if (response.data && response.data.error) {
      throw new Error(response.data.error.message);
    }

    const result = response.data.result;
    return {
      items: result.items?.map(toAsset) || [],
      limit: result.limit || limit,
      total: result.total || 0,
      page: result.page || page,
      before: result.before,
      after: result.after,
    };
  } catch (error) {
    console.error(error);
    throw error;
  }
}

/**
 * Get assets by owner address.
 * Returns just the assets array for backward compatibility.
 * Use getAssetsByOwnerWithPageInfo for pagination info.
 */
export async function getAssetsByOwner(
  url: string,
  wallet: string,
  opts: AssetsByOwnerOpts = {}
): Promise<Asset[]> {
  const result = await getAssetsByOwnerWithPageInfo(url, wallet, opts);
  return result.items;
}

export type SearchAssetsOpts = {
  sortBy?: { sortBy: "created"; sortDirection: "asc" | "desc" };
  page?: number;
  limit?: number;
  collection?: string;
  ownerAddress?: string;
  creatorAddress?: string;
  creatorVerified?: boolean;
  tokenType?:
    | "all"
    | "compressedNft"
    | "regularNft"
    | "nonFungible"
    | "fungible";
} & { [key: string]: unknown };

export async function searchAssets(
  url: string,
  opts: SearchAssetsOpts
): Promise<Asset[]> {
  return (await searchAssetsWithPageInfo(url, opts)).items;
}

export async function searchAssetsWithPageInfo(
  url: string,
  {
    creatorVerified = true,
    sortBy = { sortBy: "created", sortDirection: "asc" },
    page = 1,
    limit = 1000,
    collection,
    tokenType,
    ...rest
  }: SearchAssetsOpts
): Promise<{
  page: number;
  total: number;
  grandTotal?: number;
  limit: number;
  items: Asset[];
}> {
  const params = {
    page,
    limit,
    sortBy:
      tokenType && ["all", "fungible"].includes(tokenType) ? null : sortBy,
    creatorVerified:
      tokenType && ["all", "fungible"].includes(tokenType)
        ? null
        : creatorVerified,
    tokenType,
    ...(collection ? { grouping: ["collection", collection] } : {}),
    ...rest,
  };

  try {
    const response = await axios.post(url, {
      jsonrpc: "2.0",
      method: "searchAssets",
      id: "get-assets-op-1",
      params,
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        Expires: "0",
      },
    });

    if (response.data && response.data.error) {
      throw new Error(response.data.error.message);
    }

    const ret = response.data.result;
    return {
      items: ret.items?.map(toAsset),
      limit: ret.limit,
      total: ret.total,
      page: ret.page,
      grandTotal: ret.grand_total,
    };
  } catch (error) {
    console.error(error);
    throw error;
  }
}

/**
 * Get assets by group (e.g., collection).
 * More performant than searchAssets for collection queries.
 * Supports both page-based and cursor-based pagination.
 *
 * For cursor-based pagination, pass the `cursor` from the previous response.
 * The API will return the next page of items. Continue until cursor is undefined.
 */
export async function getAssetsByGroup(
  url: string,
  {
    groupKey = "collection",
    groupValue,
    page,
    limit = 1000,
    cursor,
  }: {
    groupKey?: string;
    groupValue: string;
    page?: number;
    limit?: number;
    cursor?: string;
  }
): Promise<{
  page?: number;
  total: number;
  limit: number;
  items: Asset[];
  cursor?: string;
}> {
  try {
    const params: any = {
      groupKey,
      groupValue,
      limit,
    };

    // Use cursor-based pagination (forward-only)
    if (cursor) {
      params.cursor = cursor;
    } else if (page) {
      params.page = page;
    }

    const response = await axios.post(url, {
      jsonrpc: "2.0",
      method: "getAssetsByGroup",
      id: "get-assets-by-group",
      params,
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        Expires: "0",
      },
    });

    if (response.data && response.data.error) {
      throw new Error(response.data.error.message);
    }

    const result = response.data.result;
    return {
      items: result.items?.map(toAsset) || [],
      limit: result.limit || limit,
      total: result.total || 0,
      page: result.page,
      cursor: result.cursor,
    };
  } catch (error) {
    console.error(error);
    throw error;
  }
}

/**
 * Get assets by creator address.
 * More performant than searchAssets for creator queries.
 */
export async function getAssetsByCreator(
  url: string,
  {
    creatorAddress,
    onlyVerified = true,
    page = 1,
    limit = 1000,
  }: {
    creatorAddress: string;
    onlyVerified?: boolean;
    page?: number;
    limit?: number;
  }
): Promise<{
  page: number;
  total: number;
  limit: number;
  items: Asset[];
}> {
  try {
    const response = await axios.post(url, {
      jsonrpc: "2.0",
      method: "getAssetsByCreator",
      id: "get-assets-by-creator",
      params: {
        creatorAddress,
        onlyVerified,
        page,
        limit,
      },
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        Expires: "0",
      },
    });

    if (response.data && response.data.error) {
      throw new Error(response.data.error.message);
    }

    const result = response.data.result;
    return {
      items: result.items?.map(toAsset) || [],
      limit: result.limit || limit,
      total: result.total || 0,
      page: result.page || page,
    };
  } catch (error) {
    console.error(error);
    throw error;
  }
}
