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
import { sendInstructionsWithPriorityFee } from '@helium/spl-utils'
import {
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

type Schedule = 'daily' | 'weekly' | 'monthly'

const TASK_QUEUE = new PublicKey('H39gEszvsi6AT4rYBiJTuZHJSF5hMHy6CKGTd7wzhsg7')

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
      return `${utcSeconds} ${utcMinutes} ${utcHours} * * ${utcDayOfWeek}`
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

const BASE_AUTOMATION_RENT = 0.012588199

export const useAutomateHotspotClaims = ({
  schedule,
  duration,
  totalHotspots,
  wallet,
}: {
  schedule: Schedule,
  duration: number,
  totalHotspots: number,
  wallet?: PublicKey,
}) => {
  const provider = useAnchorProvider()

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

  const totalFundingNeeded = useMemo(() => {
    const minCrankReward = taskQueue?.minCrankReward?.toNumber() || 10000
    return (
      duration * (minCrankReward + 5000) * (totalHotspots || 1) +
      duration * minCrankReward
    )
  }, [duration, totalHotspots, taskQueue])
  const solFee = useMemo(() => {
    return totalFundingNeeded - (cronJobSolanaAccount?.lamports || 0)
  }, [totalFundingNeeded, cronJobSolanaAccount])

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
      if (solFee > 0) {
        instructions.push(
          SystemProgram.transfer({
            fromPubkey: wallet,
            toPubkey: cronJob,
            lamports: solFee,
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
    rentFee: cronJobAccount ? 0 : BASE_AUTOMATION_RENT,
    solFee: solFee / LAMPORTS_PER_SOL,
    insufficientSol: !loadingSol && solFee > (userSol || 0),
    isOutOfSol: cronJobAccount?.removedFromQueue || false,
  }
}
