import { Connection, PublicKey } from '@solana/web3.js'
import { TransactionParser } from './parser'
import { TransactionBufferManager } from './buffer'
import { ServiceConfig, ParsedTransaction, TransactionDefinition, GetTransactionsArgs } from './types'
import logger from './logger'
import { TransactionCache } from './transactionCache'

export class RecentTransactionsService {
  private parser: TransactionParser
  private bufferManager: TransactionBufferManager
  private transactionCache: TransactionCache
  private pollingInterval: NodeJS.Timeout | null
  private isPolling: boolean
  private isCurrentlyPolling: boolean = false
  private lastSignatureByProgram: Map<string, string> = new Map()

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
    this.pollingInterval = null
    this.isPolling = false

    // Initialize buffers for each route
    for (const definition of config.definitions) {
      this.bufferManager.initializeBuffer(definition.subRoute)
    }
  }

  start() {
    if (this.isPolling) {
      logger.warn('Service is already running')
      return
    }

    logger.info('Starting transaction service')
    this.isPolling = true
    this.poll()
    this.pollingInterval = setInterval(() => this.poll(), this.pollingIntervalMs)
  }

  stop() {
    if (!this.isPolling) {
      logger.warn('Service is not running')
      return
    }

    logger.info('Stopping transaction service')
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
    }
    this.isPolling = false
    this.bufferManager.clearAll()
    this.transactionCache.clear()
    this.lastSignatureByProgram.clear()
  }

  private poll = async () => {
    if (this.isCurrentlyPolling) {
      logger.debug('Skipping poll - previous poll still running')
      return
    }

    try {
      this.isCurrentlyPolling = true
      logger.debug('Polling for new transactions')

      // Group transactions by program ID to avoid duplicate RPC calls
      const programGroups = new Map<string, { route: string; transactions: TransactionDefinition[] }>()

      for (const definition of this.config.definitions) {
        for (const transaction of definition.transactions) {
          const existing = programGroups.get(transaction.programId)
          if (existing) {
            existing.transactions.push(transaction)
          } else {
            programGroups.set(transaction.programId, {
              route: definition.subRoute,
              transactions: [transaction]
            })
          }
        }
      }

      // Poll for each unique program ID
      for (const [programId, group] of programGroups) {
        const lastSignature = this.lastSignatureByProgram.get(programId)
        const signatures = await this.connection.getSignaturesForAddress(
          new PublicKey(programId),
          {
            limit: this.maxLookbackSize,
            until: lastSignature
          },
          'confirmed'
        )

        if (signatures.length > 0) {
          // Update the last signature for this program
          this.lastSignatureByProgram.set(programId, signatures[0].signature)
          
          logger.debug({
            message: 'Found signatures',
            programId,
            count: signatures.length,
            maxLookbackSize: this.maxLookbackSize,
            maxBufferSize: this.maxBufferSize
          })
        }

        for (const signature of signatures) {
          let tx = this.transactionCache.get(signature.signature)

          if (!tx) {
            logger.debug({
              message: 'Fetching transaction',
              signature: signature.signature,
              slot: signature.slot
            })

            const fetchedTx = await this.connection.getParsedTransaction(signature.signature, {
              maxSupportedTransactionVersion: 0,
              commitment: 'confirmed'
            })

            if (!fetchedTx) {
              logger.debug({
                message: 'Transaction not found',
                signature: signature.signature
              })
              continue
            }

            tx = fetchedTx
            // Cache the parsed transaction for future use
            this.transactionCache.add(signature.signature, tx)
          } else {
            logger.debug({
              message: 'Using cached transaction',
              signature: signature.signature
            })
          }

          // Try to parse the transaction for each matching definition
          for (const transaction of group.transactions) {
            try {
              const parsedInstructions = await this.parser.parseTransaction(tx, transaction)
              if (parsedInstructions.length > 0) {
                logger.debug({
                  message: 'Parsed instructions',
                  signature: signature.signature,
                  count: parsedInstructions.length,
                  idlName: transaction.idlName
                })
              }
              for (const parsedInstruction of parsedInstructions) {
                // Add the transaction to the buffer for its route
                this.bufferManager.addTransaction(group.route, {
                  ...parsedInstruction,
                  signature: signature.signature,
                  block: signature.slot,
                  timestamp: signature.blockTime || Math.floor(Date.now() / 1000)
                })

                logger.debug({
                  message: 'Added transaction to buffer',
                  signature: signature.signature,
                  instructionIndex: parsedInstruction.instructionIndex,
                  route: group.route
                })
              }
            } catch (error) {
              logger.error(`Error parsing transaction for ${transaction.idlName}:`, error)
            }
          }
        }
      }
    } catch (error) {
      logger.error('Error polling for transactions:', error)
    } finally {
      this.isCurrentlyPolling = false
    }
  }

  getTransactions(route: string, args: GetTransactionsArgs = {}): ParsedTransaction[] {
    const transactions = this.bufferManager.getTransactions(route, args.untilBlock, args.limit)
    if (args.types && args.types.length > 0) {
      return transactions.filter(tx => !args.types || args.types.includes(tx.name))
    }
    return transactions
  }
} 