import { Connection, PublicKey, LogsCallback } from '@solana/web3.js'
import logger from './logger'

export interface SignatureUpdate {
  signature: string
  programId: string
  slot?: number
  blockTime?: number | null
}

export interface SignatureMonitorConfig {
  maxLookbackSize: number
  pollingIntervalMs: number
}

export type SignatureHandler = (update: SignatureUpdate) => Promise<void>

export class SignatureMonitor {
  private logSubscriptions: Map<string, number> = new Map()
  private lastSignatureByProgram: Map<string, string> = new Map()
  private pollingInterval: NodeJS.Timeout | null = null
  private isPolling: boolean = false
  private isCurrentlyPolling: boolean = false
  private initialFetchComplete: boolean = false
  private readonly pollingIntervalMs: number

  constructor(
    private connection: Connection,
    private programIds: string[],
    private config: SignatureMonitorConfig,
    private onSignature: SignatureHandler
  ) {
    this.pollingIntervalMs = config.pollingIntervalMs || 60000
  }

  private setupLogSubscription(programId: string) {
    try {
      const callback: LogsCallback = async (logs) => {
        if (!logs.err) {
          const signature = logs.signature
          logger.debug({
            message: 'Received log for signature via subscription',
            programId,
            signature
          })

          // Update lastSignatureByProgram before processing
          this.lastSignatureByProgram.set(programId, signature)

          // Process the signature immediately
          await this.onSignature({
            signature,
            programId,
            blockTime: null // onLogs doesn't provide blockTime
          })
        }
      }

      const subscriptionId = this.connection.onLogs(
        new PublicKey(programId),
        callback,
        'confirmed'
      )

      this.logSubscriptions.set(programId, subscriptionId)
      logger.info({
        message: 'Subscribed to program logs',
        programId,
        subscriptionId
      })
    } catch (error) {
      logger.error({
        message: 'Failed to setup log subscription',
        programId,
        error
      })
    }
  }

  private async resetSubscriptions() {
    logger.info('Resetting onLogs subscriptions')
    
    // Remove all existing subscriptions
    for (const [programId, subscriptionId] of this.logSubscriptions) {
      try {
        this.connection.removeOnLogsListener(subscriptionId)
        logger.info({
          message: 'Unsubscribed from program logs',
          programId,
          subscriptionId
        })
      } catch (error) {
        logger.error({
          message: 'Failed to unsubscribe from program logs',
          programId,
          subscriptionId,
          error
        })
      }
    }
    this.logSubscriptions.clear()

    // Setup new subscriptions
    await this.setupSubscriptions()
  }

  private async setupSubscriptions() {
    // Setup subscriptions for each program ID
    for (const programId of this.programIds) {
      this.setupLogSubscription(programId)
    }

    // Switch to longer polling interval
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
    }
    this.pollingInterval = setInterval(() => this.poll(), this.pollingIntervalMs)
  }

  private poll = async () => {
    if (this.isCurrentlyPolling) {
      logger.debug('Skipping poll - previous poll still running')
      return
    }

    try {
      this.isCurrentlyPolling = true
      logger.debug('Polling for new signatures')

      let missedTransactions = false

      // Poll for each program ID
      for (const programId of this.programIds) {
        const lastSignature = this.lastSignatureByProgram.get(programId)
        const signatures = await this.connection.getSignaturesForAddress(
          new PublicKey(programId),
          {
            limit: this.config.maxLookbackSize,
            until: lastSignature
          },
          'confirmed'
        )

        if (signatures.length > 0) {
          // If we're getting signatures via polling after initial setup,
          // this means we missed some via onLogs
          if (this.initialFetchComplete) {
            missedTransactions = true
          }

          // Update the last signature for this program
          this.lastSignatureByProgram.set(programId, signatures[0].signature)
          
          logger.debug({
            message: 'Found signatures',
            programId,
            count: signatures.length,
            maxLookbackSize: this.config.maxLookbackSize
          })

          // Process each signature
          for (const { signature, slot, blockTime } of signatures) {
            await this.onSignature({
              signature,
              programId,
              slot,
              blockTime
            })
          }
        }
      }

      // After initial fetch, setup subscriptions
      if (!this.initialFetchComplete) {
        this.initialFetchComplete = true
        await this.setupSubscriptions()
      } else if (missedTransactions) {
        // If we found signatures during polling after initial setup,
        // reset the subscriptions as they might be stale
        logger.warn('Found missed transactions during polling, resetting subscriptions')
        await this.resetSubscriptions()
      }
    } catch (error) {
      logger.error('Error polling for signatures:', error)
      
      // If we encounter an error and subscriptions are active, reset them
      if (this.initialFetchComplete && this.logSubscriptions.size > 0) {
        logger.info('Resetting subscriptions due to error')
        await this.resetSubscriptions()
      }
    } finally {
      this.isCurrentlyPolling = false
    }
  }

  start() {
    if (this.isPolling) {
      logger.warn('SignatureMonitor is already running')
      return
    }

    logger.info('Starting signature monitor')
    this.isPolling = true
    this.poll()
    this.pollingInterval = setInterval(() => this.poll(), this.config.pollingIntervalMs)
  }

  stop() {
    if (!this.isPolling) {
      logger.warn('SignatureMonitor is not running')
      return
    }

    logger.info('Stopping signature monitor')
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
    }

    // Unsubscribe from all log subscriptions
    for (const [programId, subscriptionId] of this.logSubscriptions) {
      try {
        this.connection.removeOnLogsListener(subscriptionId)
        logger.info({
          message: 'Unsubscribed from program logs',
          programId,
          subscriptionId
        })
      } catch (error) {
        logger.error({
          message: 'Failed to unsubscribe from program logs',
          programId,
          subscriptionId,
          error
        })
      }
    }
    this.logSubscriptions.clear()

    this.isPolling = false
    this.initialFetchComplete = false
    this.lastSignatureByProgram.clear()
  }
} 