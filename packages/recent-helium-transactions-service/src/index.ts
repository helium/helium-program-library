import express from "express"
import cors from "cors"
import { Connection, ConnectionConfig } from "@solana/web3.js"
import { RecentTransactionsService } from "./service"
import { ServiceConfig, TransactionQueryParams } from "./types"
import * as fs from "fs"
import * as path from "path"
import logger from "./logger"

// Load environment variables
import dotenv from "dotenv"
dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())

const CONFIG_PATH = process.env.CONFIG_PATH || "config.json"
const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com"
const PORT = process.env.PORT || 3000
const POLLING_INTERVAL = parseInt(process.env.POLLING_INTERVAL || "5000")
const MAX_BUFFER_SIZE = parseInt(process.env.MAX_BUFFER_SIZE || "100")
const MAX_LOOKBACK_SIZE = parseInt(process.env.MAX_LOOKBACK_SIZE || "100")

// Load config
const config: ServiceConfig = JSON.parse(
  fs.readFileSync(path.resolve(CONFIG_PATH), "utf-8")
)

// Initialize service
const connectionConfig: ConnectionConfig & { maxSupportedTransactionVersion: number } = {
  commitment: "confirmed",
  maxSupportedTransactionVersion: 0
}
const connection = new Connection(RPC_URL, connectionConfig)
const service = new RecentTransactionsService(
  connection,
  config,
  POLLING_INTERVAL,
  MAX_BUFFER_SIZE,
  MAX_LOOKBACK_SIZE
)

// Set up routes
config.definitions.forEach(def => {
  app.get<{}, {}, {}, TransactionQueryParams>(`/v1${def.subRoute}`, (req, res) => {
    const untilBlock = req.query.until ? parseInt(req.query.until) : undefined
    const limit = req.query.limit ? parseInt(req.query.limit) : undefined
    const types = Array.isArray(req.query.types) ? req.query.types : req.query.types ? [req.query.types] : undefined
    
    const transactions = service.getTransactions(def.subRoute, {
      untilBlock,
      limit,
      types
    })
    res.json(transactions)
  })
})

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "healthy" })
})

// Start the service and server
async function start() {
  try {
    await service.start()
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`)
      logger.info(`RPC URL: ${RPC_URL}`)
      logger.info(`Config loaded from: ${CONFIG_PATH}`)
      logger.info(`Polling interval: ${POLLING_INTERVAL}ms`)
      logger.info(`Max buffer size: ${MAX_BUFFER_SIZE}`)
      logger.info(`Max lookback size: ${MAX_LOOKBACK_SIZE}`)
    })
  } catch (error) {
    logger.error("Failed to start service:", error)
    process.exit(1)
  }
}

start() 