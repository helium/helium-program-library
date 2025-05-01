import { PublicKey } from "@solana/web3.js"

export interface AccountFieldSource {
  type: "account"
  path: string
}

export interface AnchorAccountFieldSource {
  type: "anchorAccountField"
  path: string,
  field: string
}

export interface AssetNameFieldSource {
  type: "assetName"
  merkle: string
  index: string
}

export interface RecipientAssetNameFieldSource {
  type: "recipientAssetName"
  recipient: string
}

export interface ArgumentFieldSource {
  type: "arg"
  path: string
}

export interface TokenTransferFieldSource {
  type: "innerTokenTransfer"
  destination: string
}

export type FieldSource = AccountFieldSource | AnchorAccountFieldSource | ArgumentFieldSource | TokenTransferFieldSource | AssetNameFieldSource | RecipientAssetNameFieldSource

export interface TransactionField {
  name: string
  source: FieldSource
}

export interface TransactionDefinition {
  programId: string
  idlName: string
  name: string
  fields: TransactionField[]
}

export interface RouteDefinition {
  subRoute: string
  transactions: TransactionDefinition[]
}

export interface ServiceConfig {
  definitions: RouteDefinition[]
}

export interface ParsedTransaction {
  name: string
  data: Record<string, string | number | null>
  signature: string
  block: number
  timestamp: number
  instructionIndex: number
}

export interface TransactionBuffer {
  transactions: ParsedTransaction[]
  maxSize: number
}

export interface TransactionQueryParams {
  until?: string
  limit?: string
  types?: string[]
}

export interface GetTransactionsArgs {
  untilBlock?: number
  limit?: number
  types?: string[]
} 