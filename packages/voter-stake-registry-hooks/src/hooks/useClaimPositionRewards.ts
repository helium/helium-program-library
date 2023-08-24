import { BN, Program } from '@coral-xyz/anchor'
import { useAnchorProvider } from '@helium/helium-react-hooks'
import {
  EPOCH_LENGTH,
  PROGRAM_ID,
  delegatedPositionKey,
  init,
} from '@helium/helium-sub-daos-sdk'
import { useSolanaUnixNow } from '@helium/helium-react-hooks'
import { PublicKey, TransactionInstruction } from '@solana/web3.js'
import { chunks, sendMultipleInstructions } from '@helium/spl-utils'
import { useAsyncCallback } from 'react-async-hook'
import { PositionWithMeta } from '../sdk/types'

export const useClaimPositionRewards = () => {
  const provider = useAnchorProvider();
  const unixNow = useSolanaUnixNow()
  const { error, loading, execute } = useAsyncCallback(
    async ({
      position,
      programId = PROGRAM_ID,
    }: {
      position: PositionWithMeta
      programId?: PublicKey
    }) => {
      const isInvalid =
        !unixNow ||
        !provider ||
        !position.hasRewards

      const idl = await Program.fetchIdl(programId, provider)
      const hsdProgram = await init(provider as any, programId, idl)

      if (loading) return

      if (isInvalid || !hsdProgram) {
        throw new Error('Unable to Claim Rewards, Invalid params')
      } else {
        const currentEpoch = new BN(unixNow).div(new BN(EPOCH_LENGTH))
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

        const instructions: TransactionInstruction[] = await Promise.all(
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
        )

        // This is an arbitrary threshold and we assume that up to 4 instructions can be inserted as a single Tx
        const ixsChunks = chunks(instructions, 4)
        await sendMultipleInstructions(
          provider,
          ixsChunks,
          ixsChunks.map((_) => ([]))
        )
      }
    }
  )

  return {
    error,
    loading,
    claimPositionRewards: execute,
  }
}
