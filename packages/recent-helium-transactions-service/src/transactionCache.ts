import logger from './logger'
import { ParsedTransactionWithMeta } from '@solana/web3.js'

interface CacheEntry {
  timestamp: number
  transaction: ParsedTransactionWithMeta
}

export class TransactionCache {
  private cache: Map<string, CacheEntry>
  private maxSize: number
  private maxAgeMs: number

  constructor(maxSize = 10000, maxAgeMs = 60 * 60 * 1000) { // Default 10k entries, 1 hour max age
    this.cache = new Map()
    this.maxSize = maxSize
    this.maxAgeMs = maxAgeMs
  }

  has(signature: string): boolean {
    return this.cache.has(signature)
  }

  get(signature: string): ParsedTransactionWithMeta | undefined {
    const entry = this.cache.get(signature)
    if (!entry) return undefined
    return entry.transaction
  }

  add(signature: string, transaction: ParsedTransactionWithMeta): void {
    const now = Date.now()
    
    this.cache.set(signature, {
      timestamp: now,
      transaction
    })

    // Cleanup if we've exceeded maxSize
    if (this.cache.size > this.maxSize) {
      this.cleanup()
    }
  }

  cleanup(): void {
    const now = Date.now()
    let entriesRemoved = 0
    
    // First pass: Remove expired entries
    for (const [signature, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.maxAgeMs) {
        this.cache.delete(signature)
        entriesRemoved++
      }
    }

    // If we still need to remove more entries, remove oldest ones
    if (this.cache.size > this.maxSize) {
      const sortedEntries = Array.from(this.cache.entries())
        .sort(([, a], [, b]) => a.timestamp - b.timestamp)
      
      const entriesToRemove = sortedEntries.slice(0, Math.floor(this.maxSize * 0.2)) // Remove oldest 20%
      for (const [signature] of entriesToRemove) {
        this.cache.delete(signature)
        entriesRemoved++
      }
    }

    if (entriesRemoved > 0) {
      logger.info(`Cleaned up ${entriesRemoved} entries from transaction cache. New size: ${this.cache.size}`)
    }
  }

  clear(): void {
    this.cache.clear()
    logger.info('Transaction cache cleared')
  }

  get size(): number {
    return this.cache.size
  }
} 