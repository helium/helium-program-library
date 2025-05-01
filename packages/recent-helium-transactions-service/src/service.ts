import { Connection, PublicKey } from '@solana/web3.js'
import { TransactionParser } from './parser'
import { TransactionBufferManager } from './buffer'
import { ServiceConfig, ParsedTransaction, TransactionDefinition, GetTransactionsArgs } from './types'
import logger from './logger'
import { TransactionCache } from './transactionCache'
import { SignatureMonitor, SignatureUpdate } from './signatureMonitor'

export class RecentTransactionsService {
  private parser: TransactionParser
  private bufferManager: TransactionBufferManager
  private transactionCache: TransactionCache
  private signatureMonitor: SignatureMonitor

  constructor(
    private connection: Connection,
    private config: ServiceConfig,
    private pollingIntervalMs: number,
    private maxBufferSize: number = 1000,
    private maxLookbackSize: number = 100
  ) {
    this.parser = new TransactionParser(connection)
    this.bufferManager = new TransactionBufferManager(maxBufferSize)
    this.transactionCache = new TransactionCache()

    // Get unique program IDs from config
    const programIds = Array.from(
      new Set(
        this.config.definitions.flatMap(def => 
          def.transactions.map(t => t.programId)
        )
      )
    )

    // Initialize buffers for each route
    for (const definition of config.definitions) {
      this.bufferManager.initializeBuffer(definition.subRoute)
    }

    // Create signature monitor
    this.signatureMonitor = new SignatureMonitor(
      connection,
      programIds,
      {
        maxLookbackSize,
        pollingIntervalMs,
      },
      this.handleSignature
    )
  }

  private handleSignature = async (update: SignatureUpdate) => {
    await this.processTransaction(update.signature, update.programId)
  }

  private async processTransaction(signature: string, programId: string) {
    try {
      let tx = this.transactionCache.get(signature)

      if (!tx) {
        const fetchedTx = await this.connection.getParsedTransaction(signature, {
          maxSupportedTransactionVersion: 0,
          commitment: 'confirmed'
        })

        if (!fetchedTx) {
          logger.debug({
            message: 'Transaction not found',
            signature
          })
          return
        }

        tx = fetchedTx
        this.transactionCache.add(signature, tx)
      }

      // Find the relevant program group
      const programGroups = new Map<string, { route: string; transactions: TransactionDefinition[] }>()
      for (const definition of this.config.definitions) {
        for (const transaction of definition.transactions) {
          if (transaction.programId === programId) {
            const existing = programGroups.get(programId)
            if (existing) {
              existing.transactions.push(transaction)
            } else {
              programGroups.set(programId, {
                route: definition.subRoute,
                transactions: [transaction]
              })
            }
          }
        }
      }

      const group = programGroups.get(programId)
      if (!group) return

      // Process the transaction
      for (const transaction of group.transactions) {
        try {
          const parsedInstructions = await this.parser.parseTransaction(tx, transaction)
          for (const parsedInstruction of parsedInstructions) {
            this.bufferManager.addTransaction(group.route, {
              ...parsedInstruction,
              signature,
              block: tx.slot!,
              timestamp: Math.floor(Date.now() / 1000)
            })
          }
        } catch (error) {
          logger.error(`Error parsing transaction for ${transaction.idlName}:`, error)
        }
      }
    } catch (error) {
      logger.error('Error processing transaction:', error)
    }
  }

  start() {
    logger.info('Starting transaction service')
    this.signatureMonitor.start()
  }

  stop() {
    logger.info('Stopping transaction service')
    this.signatureMonitor.stop()
    this.bufferManager.clearAll()
    this.transactionCache.clear()
  }

  getTransactions(route: string, args: GetTransactionsArgs = {}): ParsedTransaction[] {
    const transactions = this.bufferManager.getTransactions(route, args.untilBlock, args.limit)
    if (args.types && args.types.length > 0) {
      return transactions.filter(tx => !args.types || args.types.includes(tx.name))
    }
    return transactions
  }
} 