import { BN, Program } from '@coral-xyz/anchor'
import { useAnchorProvider, useSolanaUnixNow } from '@helium/helium-react-hooks'
import {
  EPOCH_LENGTH,
  PROGRAM_ID,
  delegatedPositionKey,
  init,
} from '@helium/helium-sub-daos-sdk'
import { chunks, sendMultipleInstructions } from '@helium/spl-utils'
import { PublicKey, TransactionInstruction } from '@solana/web3.js'
import { useAsyncCallback } from 'react-async-hook'
import { PositionWithMeta } from '../sdk/types'

export const useClaimAllPositionsRewards = () => {
  const provider = useAnchorProvider()
  const unixNow = useSolanaUnixNow()
  const { error, loading, execute } = useAsyncCallback(
    async ({
      positions,
      programId = PROGRAM_ID,
    }: {
      positions: PositionWithMeta[]
      programId?: PublicKey
    }) => {
      const isInvalid =
        !unixNow ||
        !provider ||
        !positions.every((pos) => pos.hasRewards)

      const idl = await Program.fetchIdl(programId, provider)
      const hsdProgram = await init(provider as any, programId, idl)

      if (loading) return

      if (isInvalid || !hsdProgram) {
        throw new Error('Unable to Claim All Rewards, Invalid params')
      } else {
        const currentEpoch = new BN(unixNow).div(new BN(EPOCH_LENGTH))
        const multiDemArray: TransactionInstruction[][] = []

        for (const [idx, position] of positions.entries()) {
          multiDemArray[idx] = multiDemArray[idx] || []
          const delegatedPosKey = delegatedPositionKey(position.pubkey)[0]
          const delegatedPosAcc = await hsdProgram.account.delegatedPositionV0.fetch(
            delegatedPosKey
          )

          const { lastClaimedEpoch } = delegatedPosAcc
          const epoch = lastClaimedEpoch.add(new BN(1))
          const epochsToClaim = Array.from(
            { length: currentEpoch.sub(epoch).toNumber() },
            (_v, k) => epoch.addn(k)
          )

          multiDemArray[idx].push(
            ...(await Promise.all(
              epochsToClaim.map(
                async (epoch) =>
                  await hsdProgram.methods
                    .claimRewardsV0({
                      epoch,
                    })
                    .accounts({
                      position: position.pubkey,
                      subDao: delegatedPosAcc.subDao,
                    })
                    .instruction()
              )
            ))
          )
        }


        for (const positionInsturctions of multiDemArray) {
          // This is an arbitrary threshold and we assume that up to 4 instructions can be inserted as a single Tx
          const ixsChunks = chunks(positionInsturctions, 4)
          await sendMultipleInstructions(
            provider,
            ixsChunks,
            ixsChunks.map(() => []),
          );
        }
      }
    }
  )

  return {
    error,
    loading,
    claimAllPositionsRewards: execute,
  }
}
