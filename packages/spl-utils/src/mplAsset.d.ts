import { Uses } from "@metaplex-foundation/mpl-bubblegum";
import { PublicKey } from "@solana/web3.js";

export interface Result {
  total: number;
  limit: number;
  page: number;
  grand_total: number;
  items: Item[];
}

export interface Item {
  interface: string;
  id: string;
  content: Content;
  authorities: Authority[];
  compression: Compression;
  grouping: Grouping[];
  royalty: Royalty;
  creators: Partial<Creator>[];
  ownership: Ownership;
  supply: Supply;
  mutable: boolean;
  burnt: boolean;
}

export interface Content {
  $schema: string;
  json_uri: string;
  files: File[];
  metadata: Metadata;
  links: Links;
}

export interface File {
  uri: string;
  cdn_uri: string;
  mime: string;
}

export interface Metadata {
  attributes: Attribute[];
  description: string;
  name: string;
  symbol: string;
  token_standard: string;
}

export interface Attribute {
  value: any;
  trait_type: string;
}

export interface Links {
  image: string;
}

export interface Authority {
  address: string;
  scopes: string[];
}

export interface Compression {
  eligible: boolean;
  compressed: boolean;
  data_hash: string;
  creator_hash: string;
  asset_hash: string;
  tree: string;
  seq: number;
  leaf_id: number;
}

export interface Grouping {
  group_key: string;
  group_value: string;
}

export interface Royalty {
  royalty_model: string;
  target: any;
  percent: number;
  basis_points: number;
  primary_sale_happened: boolean;
  locked: boolean;
}

export interface Creator {
  address: string;
  share: number;
  verified: boolean;
}

export interface Ownership {
  frozen: boolean;
  delegated: boolean;
  delegate: any;
  ownership_model: string;
  owner: string;
}

export interface Supply {
  print_max_supply: number;
  print_current_supply: number;
  edition_nonce: any;
}

export type AssetProof = {
  root: PublicKey;
  proof: PublicKey[];
  nodeIndex: number;
  leaf: PublicKey;
  treeId: PublicKey;
};

export type Asset = {
  id?: PublicKey;
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
    owner?: PublicKey;
    delegate?: PublicKey;
  };
  royalty: {
    basis_points: number;
    primary_sale_happened: boolean;
  };
  mutable: boolean;
  supply: {
    edition_nonce: number | null;
  };
  grouping?: { group_key: string; group_value?: PublicKey }[];
  uses?: Uses;
  creators: (Omit<Creator, "address"> & { address?: PublicKey })[];
};
