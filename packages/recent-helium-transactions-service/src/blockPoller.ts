import axios from 'axios'
import logger from './logger'

interface PollerConfig {
  url: string
  pollIntervalMs: number
}

export async function poll({ url, pollIntervalMs }: PollerConfig): Promise<void> {
  logger.info(`Starting block polling`)
  logger.info(`Polling URL: ${url}`)
  logger.info(`Poll interval: ${pollIntervalMs}ms`)

  let currentBlock = 0
  while (true) {
    try {
      const response = await axios.get(`${url}?until=${currentBlock}`)
      const newBlock = response.data[0]?.block
      if (newBlock) {
        currentBlock = newBlock
      }
      response.data.forEach((tx: any) => {
        console.log(JSON.stringify(tx, null, 2))
      })

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger.error(`Failed to fetch block data: ${error.message}`)
      } else {
        logger.error('An unexpected error occurred:', error)
      }
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
    }
  }
}

// Example usage:
if (require.main === module) {
  const config: PollerConfig = {
    url: process.env.BLOCK_API_URL!,
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '500'),
  }

  if (!config.url) {
    logger.error('BLOCK_API_URL environment variable is required')
    process.exit(1)
  }

  poll(config).catch(error => {
    logger.error('Failed to execute block poller:', error)
    process.exit(1)
  })
} 