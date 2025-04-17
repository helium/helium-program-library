import { ParsedTransaction, TransactionBuffer } from "./types"

export class TransactionBufferManager {
  private buffers: Map<string, TransactionBuffer> = new Map()

  constructor(private defaultMaxSize: number = 1000) {}

  initializeBuffer(route: string, maxSize?: number) {
    if (!this.buffers.has(route)) {
      this.buffers.set(route, {
        transactions: [],
        maxSize: maxSize || this.defaultMaxSize
      })
    }
  }

  addTransaction(route: string, transaction: ParsedTransaction) {
    const buffer = this.buffers.get(route)
    if (!buffer) {
      throw new Error(`Buffer not initialized for route: ${route}`)
    }

    buffer.transactions.unshift(transaction)
    if (buffer.transactions.length > buffer.maxSize) {
      buffer.transactions.pop()
    }
  }

  getTransactions(route: string, untilBlock?: number, limit?: number): ParsedTransaction[] {
    const buffer = this.buffers.get(route)
    if (!buffer) {
      throw new Error(`Buffer not initialized for route: ${route}`)
    }

    if (!untilBlock) {
      return buffer.transactions
    }

    return buffer.transactions.filter(tx => tx.block > untilBlock).slice(0, limit)
  }

  clear(route: string) {
    const buffer = this.buffers.get(route)
    if (buffer) {
      buffer.transactions = []
    }
  }

  clearAll() {
    this.buffers.forEach(buffer => {
      buffer.transactions = []
    })
  }
} 