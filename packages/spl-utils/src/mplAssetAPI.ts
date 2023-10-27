import { PublicKey } from "@solana/web3.js";
import axios from "axios";
import base58 from "bs58";
import { Asset, AssetProof, Item, Result } from "./mplAsset";

function mapAddressToPubKey(
  key: "address" | "group_value",
  items?: (any & { address: string })[]
) {
  if (!items) return [];
  return items.map((item) => ({
    ...item,
    key: toPubKey(item[key]),
  }));
}

function toBuffer(item?: string) {
  return item ? Buffer.from(base58.decode(item)) : undefined;
}

function toPubKey(item?: string) {
  return item ? new PublicKey(item) : undefined;
}

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
    const result = response.data.result;
    if (result) {
      return result.map(toAsset);
    }
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

    const response = await axios.post<
      {
        jsonrpc: string;
        result: Item;
        id: string;
      }[]
    >(url, JSON.stringify(batch), {
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        Expires: "0",
      },
    });

    return response.data
      ?.flatMap((item) => {
        if (!item?.result) return [];
        return [item.result];
      })
      .map((item) => toAsset(item));
  } catch (error) {
    console.error(error);
    throw error;
  }
}

function toAsset(result: Item): Asset {
  return {
    ...result,
    creators: mapAddressToPubKey("address", result.creators),
    id: new PublicKey(result.id),
    grouping: mapAddressToPubKey("group_value", result.grouping),
    compression: {
      ...result.compression,
      leafId: result.compression.leaf_id,
      dataHash: toBuffer(result.compression.data_hash),
      creatorHash: toBuffer(result.compression.creator_hash),
      assetHash: toBuffer(result.compression.asset_hash),
      tree: toPubKey(result.compression.tree),
    },
    ownership: {
      ...result.ownership,
      delegate: toPubKey(result.ownership.delegate),
      owner: toPubKey(result.ownership.owner),
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
  limit?: number;
  page?: number;
  collection?: string;
  ownerAddress: string;
  creatorAddress: string;
  creatorVerified?: boolean;
  displayOptions?: { showGrandTotal?: boolean };
} & { [key: string]: unknown };

export async function fetchAssets(
  url: string,
  {
    creatorVerified = true,
    sortBy = { sortBy: "created", sortDirection: "asc" },
    page = 1,
    ...rest
  }: SearchAssetsOpts
) {
  try {
    const response = await axios.post<{
      jsonrpc: string;
      result: Result;
      id: string;
    }>(url, {
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

    return response.data;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function searchAssets(
  url: string,
  opts: SearchAssetsOpts
): Promise<Asset[]> {
  const response = await fetchAssets(url, opts);
  return response.result?.items.map(toAsset);
}

export async function searchPagedAssets(
  url: string,
  {
    creatorVerified = true,
    sortBy = { sortBy: "created", sortDirection: "asc" },
    page = 1,
    limit = 1000,
    displayOptions,
    ...opts
  }: SearchAssetsOpts
): Promise<{ data: Asset[]; grandTotal?: number; totalPages?: number }> {
  try {
    // according to helius, we should only query for the grand total on the first page
    const showGrandTotal = displayOptions?.showGrandTotal && page === 1;

    const response = await fetchAssets(url, {
      page,
      limit,
      creatorVerified,
      sortBy,
      displayOptions: { showGrandTotal },
      ...opts,
    });

    const data = response.result?.items?.map(toAsset) || [];

    if (!displayOptions?.showGrandTotal) {
      return { data };
    }

    const grandTotal = response.result?.grand_total;
    let totalPages: number | undefined = undefined;
    if (grandTotal) {
      totalPages = Math.ceil(grandTotal / limit);
    }

    return { grandTotal, totalPages, data };
  } catch (error) {
    console.error(error);
    throw error;
  }
}
