import {
  Program,
  BorshInstructionCoder,
  Idl,
  BN,
  AnchorProvider,
  Wallet,
  BorshAccountsCoder,
} from "@coral-xyz/anchor"
import {
  Connection,
  ParsedTransactionWithMeta,
  PublicKey,
  PartiallyDecodedInstruction,
  ParsedInstruction,
  AccountMeta
} from "@solana/web3.js"
import { getAsset } from "@helium/spl-utils"
import { TOKEN_PROGRAM_ID } from "@solana/spl-token"
import { init, PROGRAM_ID } from "@helium/lazy-distributor-sdk"
import { get } from "lodash"
import {
  TransactionDefinition,
  ParsedTransaction,
  AccountFieldSource,
  ArgumentFieldSource,
  TokenTransferFieldSource,
  AssetNameFieldSource,
  RecipientAssetNameFieldSource,
  AnchorAccountFieldSource
} from "./types"
import logger from "./logger"
import { convertIdlToCamelCase, IdlInstructionAccounts, IdlInstruction, IdlInstructionAccount } from "@coral-xyz/anchor/dist/cjs/idl"

type DecodedInstruction = {
  name: string
  accounts: Record<string, PublicKey>
  args: Record<string, any>
}

interface TokenTransferInstruction extends PartiallyDecodedInstruction {
  parsed: {
    info: {
      amount: string
      authority?: string
      destination?: string
      source?: string
    }
    type: string
  }
}

export class TransactionParser {
  private connection: Connection
  private programIdls: Map<string, Idl> = new Map()

  constructor(connection: Connection) {
    this.connection = connection
  }

  async loadIdl(programId: PublicKey): Promise<Idl> {
    const idlKey = programId.toBase58()
    if (!this.programIdls.has(idlKey)) {
      const provider = { connection: this.connection } as any
      const idlRaw = await Program.fetchIdl(programId, provider)
      if (!idlRaw) {
        throw new Error(`Failed to fetch IDL for program ${idlKey}`)
      }
      this.programIdls.set(idlKey, convertIdlToCamelCase(idlRaw))
    }
    return this.programIdls.get(idlKey)!
  }

  private extractAccountFieldValue(
    source: AccountFieldSource,
    instruction: DecodedInstruction
  ): string {
    const account = instruction.accounts[source.path]
    return account?.toBase58() || ""
  }


  private extractArgumentFieldValue(
    source: ArgumentFieldSource,
    instruction: DecodedInstruction
  ): string | number {
    return get(instruction.args, source.path) || ""
  }

  private isTokenTransferInstruction(ix: PartiallyDecodedInstruction | ParsedInstruction, destination: PublicKey): ix is TokenTransferInstruction {
    return (
      'programId' in ix &&
      ix.programId.equals(TOKEN_PROGRAM_ID) &&
      'parsed' in ix &&
      ix.parsed?.type === 'transfer' &&
      ix.parsed?.info?.destination === destination.toBase58()
    )
  }

  private extractTokenTransferFieldValue(
    source: TokenTransferFieldSource,
    instruction: DecodedInstruction,
    innerInstructions: (PartiallyDecodedInstruction | ParsedInstruction)[]
  ): string {
    const relevantInner = innerInstructions.find((ix) => {
      const destination = instruction.accounts[source.destination]
      if (this.isTokenTransferInstruction(ix, destination)) {
        return true
      }
      return false
    }) as TokenTransferInstruction | undefined

    if (relevantInner?.parsed?.info?.amount) {
      return relevantInner.parsed.info.amount
    }
    return ""
  }

  private async extractAssetNameFieldValue(
    source: AssetNameFieldSource,
    instruction: DecodedInstruction
  ): Promise<string> {
    const merkle = instruction.accounts[source.merkle]
    const index = get(instruction.args, source.index)
    const assetId = getLeafAssetId(merkle, new BN(index));
    const asset = await getAsset(process.env.ASSET_API_URL || this.connection.rpcEndpoint, assetId)
    return asset?.content.metadata.name || ""
  }

  private async extractRecipientAssetNameFieldValue(
    source: RecipientAssetNameFieldSource,
    instruction: DecodedInstruction
  ): Promise<string> {
    const recipient = instruction.accounts[source.recipient]
    const program = await init(new AnchorProvider(this.connection, {} as Wallet, { commitment: "confirmed" }), PROGRAM_ID, await this.loadIdl(PROGRAM_ID))
    const recipientAccount = await program.account.recipientV0.fetch(recipient)
    const assetId = recipientAccount.asset
    const asset = await getAsset(process.env.ASSET_API_URL || this.connection.rpcEndpoint, assetId)

    return asset?.content.metadata.name || ""
  }

  private async extractAnchorAccountFieldValue(
    source: AnchorAccountFieldSource,
    instruction: DecodedInstruction
  ): Promise<string | null> {
    const accountKey = instruction.accounts[source.path]
    const account = await this.connection.getAccountInfo(accountKey)
    if (account) {
      const idl = await this.loadIdl(account.owner)
      const coder = new BorshAccountsCoder(idl)
      const coded = coder.decodeAny(account.data)
      return get(coded, source.field) || null
    }

    return null
  }

  private async extractFieldValue(
    source: AccountFieldSource | AnchorAccountFieldSource | ArgumentFieldSource | TokenTransferFieldSource | AssetNameFieldSource | RecipientAssetNameFieldSource,
    instruction: DecodedInstruction,
    innerInstructions: (PartiallyDecodedInstruction | ParsedInstruction)[]
  ): Promise<string | number | null> {
    switch (source.type) {
      case "account":
        return this.extractAccountFieldValue(source, instruction)
      case "arg":
        return this.extractArgumentFieldValue(source, instruction)
      case "innerTokenTransfer":
        return this.extractTokenTransferFieldValue(source, instruction, innerInstructions)
      case "assetName":
        return this.extractAssetNameFieldValue(source, instruction)
      case "recipientAssetName":
        return this.extractRecipientAssetNameFieldValue(source, instruction)
      case "anchorAccountField":
        return this.extractAnchorAccountFieldValue(source, instruction)
    }
  }

  private formatAccountsRecursively(
    accounts: IdlInstructionAccounts[] | IdlInstructionAccount[],
    pubkeys: PublicKey[],
    parentName?: string
  ): Record<string, PublicKey> {
    const result: Record<string, PublicKey> = {}
    let currentIndex = 0

    for (const account of accounts) {
      if ('accounts' in account) {
        // Handle nested account group
        const prefix = account.name || parentName
        const nestedAccounts = this.formatAccountsRecursively(
          account.accounts,
          pubkeys.slice(currentIndex),
          prefix
        )
        Object.assign(result, nestedAccounts)
        currentIndex += account.accounts.length
      } else if (account.name) {
        // Handle single account
        const fullName = parentName ? `${parentName}.${account.name}` : account.name
        result[fullName] = pubkeys[currentIndex]
        currentIndex++
      }
    }

    return result
  }

  async parseTransaction(
    txWithMeta: ParsedTransactionWithMeta,
    definition: TransactionDefinition
  ): Promise<ParsedTransaction[]> {
    try {
      const programId = new PublicKey(definition.programId)
      const idl = await this.loadIdl(programId)
      const coder = new BorshInstructionCoder(idl)

      // Find all matching instructions in the transaction
      const matchingInstructions = txWithMeta.transaction.message.instructions
        .map((ix, index) => ({ ix, index }))
        .filter(({ ix }) => 'programId' in ix && ix.programId.equals(programId))

      if (matchingInstructions.length === 0) {
        return []
      }

      const parsedInstructions = (await Promise.all(matchingInstructions
        .map(async ({ ix, index }) => {
          if (!('data' in ix)) return null

          const decodedInstruction = coder.decode(ix.data, "base58")
          if (!decodedInstruction || decodedInstruction.name !== definition.idlName) {
            if (!decodedInstruction) {
              logger.debug({
                message: 'Unable to decode instruction',
                programId,
                transaction: txWithMeta.transaction.signatures[0],
                data: ix.data,
                decodedInstruction
              })
            }
            return null
          }

          const idlInstruction = idl.instructions?.find((inst) => inst.name === decodedInstruction.name)
          if (!idlInstruction) {
            logger.debug({
              message: 'Instruction not found in IDL',
              programId,
              instructionName: decodedInstruction.name
            })
            return null
          }

          const formattedAccounts = this.formatAccountsRecursively(idlInstruction.accounts, ix.accounts)
          const innerInstructions = txWithMeta.meta?.innerInstructions
            ?.find((inner) => inner.index === index)
            ?.instructions || []

          const data: Record<string, string | number | null> = {}
          for (const field of definition.fields) {
            data[field.name] = await this.extractFieldValue(
              field.source,
              {
                name: decodedInstruction.name,
                accounts: formattedAccounts,
                args: decodedInstruction.data
              },
              innerInstructions
            )
          }

          return {
            name: definition.name,
            data,
            signature: txWithMeta.transaction.signatures[0],
            block: txWithMeta.slot,
            timestamp: txWithMeta.blockTime || 0,
            instructionIndex: index
          }
        })))
        .filter((parsed): parsed is NonNullable<typeof parsed> => parsed !== null)

      return parsedInstructions
    } catch (error) {
      logger.error("Error parsing transaction:", error)
      return []
    }
  }
}

function getLeafAssetId(tree: PublicKey, leafIndex: BN) {
  const [assetId] = PublicKey.findProgramAddressSync([Buffer.from('asset', 'utf8'), tree.toBuffer(), Uint8Array.from(leafIndex.toArray('le', 8))], new PublicKey("BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY"));
  return assetId;
}