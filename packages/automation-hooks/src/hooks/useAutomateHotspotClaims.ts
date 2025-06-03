import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import {
  cronJobKey,
  cronJobNameMappingKey,
  cronJobTransactionKey,
} from '@helium/cron-sdk'
import { useAnchorProvider, useSolOwnedAmount } from '@helium/helium-react-hooks'
import {
  entityCronAuthorityKey,
  init as initHplCrons,
} from '@helium/hpl-crons-sdk'
import { HNT_MINT, sendInstructionsWithPriorityFee } from '@helium/spl-utils'
import {
  customSignerKey,
  init as initTuktuk,
  nextAvailableTaskIds,
  taskKey,
} from '@helium/tuktuk-sdk'
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js'
import { useMemo } from 'react'
import { useAsyncCallback } from 'react-async-hook'
import { useCronJob } from './useCronJob'
import { useTaskQueue } from './useTaskQueue'
import { AnchorProvider } from '@coral-xyz/anchor'
import { TASK_QUEUE } from '../constants'
import { useAccount } from '@helium/account-fetch-cache-hooks'

type Schedule = 'daily' | 'weekly' | 'monthly'

const getScheduleCronString = (schedule: Schedule) => {
  // Get current time and add 1 minute
  const now = new Date()
  now.setMinutes(now.getMinutes() + 1)

  // Convert to UTC
  const utcSeconds = now.getUTCSeconds()
  const utcMinutes = now.getUTCMinutes()
  const utcHours = now.getUTCHours()
  const utcDayOfMonth = now.getUTCDate()
  const utcDayOfWeek = now.getUTCDay()

  switch (schedule) {
    case 'daily':
      // Run at the same hour and minute every day in UTC
      return `${utcSeconds} ${utcMinutes} ${utcHours} * * *`
    case 'weekly':
      // Run at the same hour and minute on the same day of week in UTC
      return `${utcSeconds} ${utcMinutes} ${utcHours} * * ${utcDayOfWeek + 1}`
    case 'monthly':
      // Run at the same hour and minute on the same day of month in UTC
      return `${utcSeconds} ${utcMinutes} ${utcHours} ${utcDayOfMonth} * *`
    default:
      return `${utcSeconds} ${utcMinutes} ${utcHours} * * *`
  }
}

export const interpretCronString = (
  cronString: string,
): {
  schedule: Schedule
  time: string
  nextRun: Date
} => {
  const [seconds, minutes, hours, dayOfMonth, month, dayOfWeek] =
    cronString.split(' ')

  // Create a UTC date object for the next run time
  const now = new Date()
  const nextRunUTC = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      parseInt(hours, 10),
      parseInt(minutes, 10),
      parseInt(seconds, 10),
    ),
  )

  // Convert UTC to local time for display
  const nextRun = new Date(nextRunUTC)

  // Format time as HH:MM AM/PM in local time
  const timeStr = nextRun.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

  // Determine schedule type
  let schedule: Schedule
  if (dayOfMonth !== '*' && month === '*') {
    schedule = 'monthly'
    // If the day has already passed this month, move to next month
    if (now.getUTCDate() > parseInt(dayOfMonth, 10)) {
      nextRunUTC.setUTCMonth(nextRunUTC.getUTCMonth() + 1)
    }
    nextRunUTC.setUTCDate(parseInt(dayOfMonth, 10))
    nextRun.setTime(nextRunUTC.getTime())
  } else if (dayOfWeek !== '*') {
    schedule = 'weekly'
    // Calculate days until next occurrence
    const currentDay = now.getUTCDay()
    const targetDay = parseInt(dayOfWeek, 10)
    const daysUntil = targetDay - currentDay
    nextRunUTC.setUTCDate(
      now.getUTCDate() + (daysUntil >= 0 ? daysUntil : 7 + daysUntil),
    )
    nextRun.setTime(nextRunUTC.getTime())
  } else {
    schedule = 'daily'
    // If time has already passed today in UTC, move to tomorrow
    if (now > nextRun) {
      nextRunUTC.setUTCDate(nextRunUTC.getUTCDate() + 1)
      nextRun.setTime(nextRunUTC.getTime())
    }
  }

  return {
    schedule,
    time: timeStr,
    nextRun,
  }
}

const BASE_AUTOMATION_RENT = 0.02098095
const TASK_RETURN_ACCOUNT_SIZE = 0.01
const MIN_RENT = 0.00089088
const EST_TX_FEE = 0.000001
const RECIPIENT_RENT = 0.00242208
const ATA_RENT = 0.002039 * LAMPORTS_PER_SOL;

export const useAutomateHotspotClaims = ({
  schedule,
  duration,
  totalHotspots,
  hotspotsNeedingRecipient = 0,
  wallet,
  provider: providerRaw
}: {
  schedule: Schedule,
  duration: number,
  totalHotspots: number,
  hotspotsNeedingRecipient?: number,
  wallet?: PublicKey,
  provider?: AnchorProvider;
}) => {
  const providerFromHook = useAnchorProvider()
  const provider = providerRaw || providerFromHook

  const authority = useMemo(() => {
    if (!wallet) return undefined
    return entityCronAuthorityKey(wallet)[0]
  }, [wallet])

  const cronJob = useMemo(() => {
    if (!authority) return undefined
    return cronJobKey(authority, 0)[0]
  }, [authority])

  const { amount: userSol, loading: loadingSol } = useSolOwnedAmount(
    wallet,
  )

  const { info: cronJobAccount, account: cronJobSolanaAccount } =
    useCronJob(cronJob)

  const { info: taskQueue } = useTaskQueue(TASK_QUEUE)

  const pdaWallet = useMemo(() => {
    if (!wallet) return undefined
    return customSignerKey(TASK_QUEUE, [
      Buffer.from("claim_payer"),
      wallet.toBuffer(),
    ])[0]
  }, [wallet])
  const { amount: pdaWalletSol } = useSolOwnedAmount(
    pdaWallet,
  )
  const ata = useMemo(() => {
    if (!wallet) return undefined
    return getAssociatedTokenAddressSync(
      HNT_MINT,
      wallet,
      true
    )
  }, [wallet])

  const crankFundingNeeded = useMemo(() => {
    const minCrankReward = taskQueue?.minCrankReward?.toNumber() || 10000
    return (
      duration * minCrankReward
    )
  }, [duration, totalHotspots, taskQueue])
  const { account } = useAccount(ata)
  const pdaWalletFundingNeeded = useMemo(() => {
    const minCrankReward = taskQueue?.minCrankReward?.toNumber() || 10000
    return (
      (MIN_RENT * LAMPORTS_PER_SOL) +
      (account ? 0 : ATA_RENT) +
      // Actual claim txs
      duration * 20000 * (totalHotspots || 1) +
      // Requeue transactions (5 queues per tx)
      duration * minCrankReward * Math.ceil((totalHotspots || 1) / 5)
    )
  }, [duration, totalHotspots, taskQueue])
  const crankSolFee = useMemo(() => {
    return crankFundingNeeded - (cronJobSolanaAccount?.lamports || 0)
  }, [crankFundingNeeded, cronJobSolanaAccount])
  const pdaWalletSolFee = useMemo(() => {
    return pdaWalletFundingNeeded - Number(pdaWalletSol?.toString() || 0)
  }, [pdaWalletFundingNeeded, pdaWalletSol])

  const { loading, error, execute } = useAsyncCallback(
    async (params: {
      onInstructions?: (instructions: TransactionInstruction[]) => Promise<void>
    }) => {
      if (!provider || !authority || !cronJob || !wallet) {
        throw new Error('Missing required parameters')
      }
      const hplCronsProgram = await initHplCrons(provider)
      const tuktukProgram = await initTuktuk(provider)

      const taskQueueAcc = await tuktukProgram.account.taskQueueV0.fetch(
        TASK_QUEUE,
      )
      const nextAvailable = nextAvailableTaskIds(
        taskQueueAcc.taskBitmap,
        1,
        false,
      )[0]
      const [task] = taskKey(TASK_QUEUE, nextAvailable)

      const instructions: TransactionInstruction[] = []

      // If cronJob doesn't exist or schedule changed, create/recreate it
      if (
        !cronJobAccount ||
        (cronJobAccount.schedule &&
          interpretCronString(cronJobAccount.schedule).schedule !== schedule)
      ) {
        // If it exists but schedule changed, remove it first
        if (cronJobAccount) {
          const maxTxId = cronJobAccount.nextTransactionId || 0
          const txIds = Array.from({ length: maxTxId }, (_, i) => i)

          instructions.push(
            ...(await Promise.all(
              txIds.map((txId) =>
                hplCronsProgram.methods
                  .removeEntityFromCronV0({
                    index: txId,
                  })
                  .accounts({
                    cronJob,
                    rentRefund: wallet,
                    cronJobTransaction: cronJobTransactionKey(cronJob, txId)[0],
                  })
                  .instruction(),
              ),
            )),
            await hplCronsProgram.methods
              .closeEntityClaimCronV0()
              .accounts({
                cronJob,
                rentRefund: wallet,
                cronJobNameMapping: cronJobNameMappingKey(
                  authority,
                  'entity_claim',
                )[0],
              })
              .instruction(),
          )
        }

        // Create new cron job
        instructions.push(
          await hplCronsProgram.methods
            .initEntityClaimCronV0({
              schedule: getScheduleCronString(schedule),
            })
            .accounts({
              taskQueue: TASK_QUEUE,
              cronJob,
              task,
              cronJobNameMapping: cronJobNameMappingKey(
                authority,
                'entity_claim',
              )[0],
            })
            .instruction(),
        )
      } else if (cronJobAccount?.removedFromQueue) {
        // If cron exists but was removed from queue due to insufficient SOL, requeue it
        instructions.push(
          await hplCronsProgram.methods
            .requeueEntityClaimCronV0()
            .accounts({
              taskQueue: TASK_QUEUE,
              cronJob,
              task,
              cronJobNameMapping: cronJobNameMappingKey(
                authority,
                'entity_claim',
              )[0],
            })
            .instruction(),
        )
      }

      // Add SOL if needed
      if (crankSolFee > 0) {
        instructions.push(
          SystemProgram.transfer({
            fromPubkey: wallet,
            toPubkey: cronJob,
            lamports: crankSolFee + (cronJobAccount ? 0 : TASK_RETURN_ACCOUNT_SIZE * LAMPORTS_PER_SOL),
          }),
        )
      }

      if (pdaWalletSolFee > 0) {
        instructions.push(
          SystemProgram.transfer({
            fromPubkey: wallet,
            toPubkey: pdaWallet,
            lamports: pdaWalletSolFee + (hotspotsNeedingRecipient * RECIPIENT_RENT * LAMPORTS_PER_SOL),
          }),
        )
      }

      // Add the entity to the cron job if it's new
      if (!cronJobAccount) {
        const { instruction } = await hplCronsProgram.methods
          .addWalletToEntityCronV0({
            index: 0,
          })
          .accounts({
            wallet,
            cronJob,
            cronJobTransaction: cronJobTransactionKey(cronJob, 0)[0],
          })
          .prepare()

        instructions.push(instruction)
      }

      if (params.onInstructions) {
        await params.onInstructions(instructions)
      } else {
        await sendInstructionsWithPriorityFee(provider, instructions, {
          computeUnitLimit: 500000,
        })
      }
    },
  )

  const {
    execute: remove,
    loading: removing,
    error: removeError,
  } = useAsyncCallback(
    async (params: {
      onInstructions?: (instructions: any) => Promise<void>
    }) => {
      if (!provider || !cronJob || !authority || !wallet) {
        throw new Error('Missing required parameters')
      }
      const hplCronsProgram = await initHplCrons(provider)
      const maxTxId = cronJobAccount?.nextTransactionId || 0
      const txIds = Array.from({ length: maxTxId }, (_, i) => i)

      const instructions = [
        ...(await Promise.all(
          txIds.map((txId) =>
            hplCronsProgram.methods
              .removeEntityFromCronV0({
                index: txId,
              })
              .accounts({
                cronJob,
                rentRefund: wallet,
                cronJobTransaction: cronJobTransactionKey(cronJob, txId)[0],
              })
              .instruction(),
          ),
        )),
        await hplCronsProgram.methods
          .closeEntityClaimCronV0()
          .accounts({
            cronJob,
            rentRefund: wallet,
            cronJobNameMapping: cronJobNameMappingKey(
              authority,
              'entity_claim',
            )[0],
          })
          .instruction(),
      ]

      if (params.onInstructions) {
        await params.onInstructions(instructions)
      } else {
        await sendInstructionsWithPriorityFee(provider, instructions, {
          computeUnitLimit: 500000,
        })
      }
    },
  )

  const rentFee = cronJobAccount ? 0 : BASE_AUTOMATION_RENT + TASK_RETURN_ACCOUNT_SIZE

  const recipientFee = hotspotsNeedingRecipient * RECIPIENT_RENT
  const totalSolNeeded = (crankSolFee + pdaWalletSolFee) / LAMPORTS_PER_SOL + rentFee + recipientFee
  const userSolBalance = Number(userSol || 0) / LAMPORTS_PER_SOL
  const minimumRequiredBalance = MIN_RENT + EST_TX_FEE
  const availableUserBalance = userSolBalance - minimumRequiredBalance

  return {
    loading: loading || removing,
    error: error || removeError,
    execute,
    remove,
    hasExistingAutomation: !!cronJobAccount && !cronJobAccount.removedFromQueue,
    cron: cronJobAccount,
    currentSchedule: cronJobAccount?.schedule
      ? interpretCronString(cronJobAccount.schedule)
      : undefined,
    rentFee,
    recipientFee,
    solFee: (crankSolFee + pdaWalletSolFee) / LAMPORTS_PER_SOL,
    insufficientSol: !loadingSol && totalSolNeeded > availableUserBalance,
    isOutOfSol: cronJobAccount?.removedFromQueue || false,
  }
}
