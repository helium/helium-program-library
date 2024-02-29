---
sidebar_position: 1
slug: /
---

# Getting Started

Helium Program Library lets you build on the Helium Network.

Looking to learn more about the Helium Program Library? You're in the right place!

## Initializing the SDK

Let's get started by installing the sdks

```shell
yarn add @helium/account-fetch-cache @helium/account-fetch-cache-hooks @helium/address @helium/crypto-react-native @helium/currency @helium/currency-utils @helium/data-credits-sdk @helium/distributor-oracle @helium/helium-entity-manager-sdk @helium/helium-react-hooks @helium/helium-sub-daos-sdk @helium/hotspot-utils @helium/http @helium/idls @helium/lazy-distributor-sdk @helium/spl-utils
```

Note that you only need to install the sdks of the contracts you wish to use.

## Claiming Hotspot Rewards

The `lazy-distributor` contract is used to claim rewards for hotspots.

### First you need to get the compressed collectables by creator

```js async name=get-compressed-collectables
import { entityCreatorKey } from '@helium/helium-entity-manager-sdk'
import { daoKey } from '@helium/helium-sub-daos-sdk'
import { HNT_MINT, searchAssets } from '@helium/spl-utils'
import { AnchorProvider } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'

export const DAO_KEY = daoKey(HNT_MINT)[0]

export const getCompressedCollectablesByCreator = async (
  pubKey: PublicKey,
  anchorProvider: AnchorProvider,
  page?: number,
  limit?: number
) => {
  const conn = anchorProvider.connection
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const items = await searchAssets(conn.rpcEndpoint, {
    ownerAddress: pubKey.toBase58(),
    creatorVerified: true,
    creatorAddress: entityCreatorKey(DAO_KEY)[0].toBase58(),
    page,
    limit,
  })

  return items
}
```

### Annotate pending rewards to all hotspots

```js async name=annotate-pending-rewards

import { AnchorProvider } from '@coral-xyz/anchor'
import { Asset, HNT_MINT } from '@helium/spl-utils'
import * as lz from '@helium/lazy-distributor-sdk'
import { init, keyToAssetForAsset, decodeEntityKey } from '@helium/helium-entity-manager-sdk'
import { daoKey } from '@helium/helium-sub-daos-sdk'
import { getPendingRewards } from '@helium/distributor-oracle'

export const DAO_KEY = daoKey(HNT_MINT)[0]

export type HotspotWithPendingRewards = Asset & {
  // mint id to pending rewards
  pendingRewards: Record<string, string> | undefined
}

export async function annotateWithPendingRewards(
  provider: AnchorProvider,
  hotspots: Asset[],
): Promise<HotspotWithPendingRewards[]> {
  const program = await lz.init(provider)
  const hemProgram = await init(provider)
  const dao = DAO_KEY
  const keyToAssets = hotspots.map((h) =>
    keyToAssetForAsset(h),
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ktaAccs = await getCachedKeyToAssets(hemProgram as any, keyToAssets)
  const entityKeys = ktaAccs.map(
    (kta) =>
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      decodeEntityKey(kta.entityKey, kta.keySerialization)!,
  )

  const mobileRewards = await getPendingRewards(
    program,
    MOBILE_LAZY_KEY,
    dao,
    entityKeys,
  )

  const iotRewards = await getPendingRewards(
    program,
    IOT_LAZY_KEY,
    dao,
    entityKeys,
  )

  return hotspots.map((hotspot, index) => {
    const entityKey = entityKeys[index]

    return {
      ...hotspot,
      pendingRewards: {
        [Mints.MOBILE]: mobileRewards[entityKey],
        [Mints.IOT]: iotRewards[entityKey],
      },
    } as HotspotWithPendingRewards
  })
}
```

### Generate claim txns and send txns in batches

```js async name=generate-claim-txns
import { AnchorProvider } from '@coral-xyz/anchor'
import { Asset, HNT_MINT } from '@helium/spl-utils'
import * as lz from '@helium/lazy-distributor-sdk'
import { init, keyToAssetForAsset, decodeEntityKey } from '@helium/helium-entity-manager-sdk'
import { daoKey } from '@helium/helium-sub-daos-sdk'
import { getPendingRewards, formBulkTransactions, getBulkRewards } from '@helium/distributor-oracle'

export const claimAllRewards =
  async (
    {
      account,
      anchorProvider,
      cluster,
      lazyDistributors,
      hotspots,
    } : {
      account: string,
      anchorProvider: AnchorProvider,
      cluster: string,
      lazyDistributors: PublicKey[],
      hotspots: HotspotWithPendingRewards[],
    }
  ) => {
    try {
      const ret: string[] = []
      let triesRemaining = 10
      const program = await lz.init(anchorProvider)
      const hemProgram = await init(anchorProvider)

      const mints = await Promise.all(
        lazyDistributors.map(async (d) => {
          return (await program.account.lazyDistributorV0.fetch(d)).rewardsMint
        }),
      )
      const ldToMint = lazyDistributors.reduce((acc, ld, index) => {
        acc[ld.toBase58()] = mints[index]
        return acc
      }, {} as Record<string, PublicKey>)
      // One tx per hotspot per mint/lazy dist
      const totalTxns = hotspots.reduce((acc, hotspot) => {
        mints.forEach((mint) => {
          if (
            hotspot.pendingRewards &&
            hotspot.pendingRewards[mint.toString()] &&
            new BN(hotspot.pendingRewards[mint.toString()]).gt(new BN(0))
          )
            acc += 1
        })
        return acc
      }, 0)
      dispatch(
        solanaSlice.actions.setPaymentProgress({
          percent: 0,
          text: 'Preparing transactions...',
        }),
      )
      for (const lazyDistributor of lazyDistributors) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const mint = ldToMint[lazyDistributor.toBase58()]!
        const hotspotsWithRewards = hotspots.filter(
          (hotspot) =>
            hotspot.pendingRewards &&
            new BN(hotspot.pendingRewards[mint.toBase58()]).gt(new BN(0)),
        )
        for (let chunk of chunks(hotspotsWithRewards, CHUNK_SIZE)) {
          const thisRet: string[] = []
          // Continually send in bulk while resetting blockhash until we send them all
          // eslint-disable-next-line no-constant-condition
          while (true) {
            dispatch(
              solanaSlice.actions.setPaymentProgress({
                percent: ((ret.length + thisRet.length) * 100) / totalTxns,
                text: `Preparing batch of ${chunk.length} transactions.\n${
                  totalTxns - ret.length
                } total transactions remaining.`,
              }),
            )
            const recentBlockhash =
              // eslint-disable-next-line no-await-in-loop
              await anchorProvider.connection.getLatestBlockhash('confirmed')

            const keyToAssets = chunk.map((h) =>
              keyToAssetForAsset(solUtils.toAsset(h)),
            )
            const ktaAccs = await solUtils.getCachedKeyToAssets(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              hemProgram as any,
              keyToAssets,
            )
            const entityKeys = ktaAccs.map(
              (kta) =>
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                decodeEntityKey(kta.entityKey, kta.keySerialization)!,
            )

            const rewards = await getBulkRewards(
              program,
              lazyDistributor,
              entityKeys,
            )

            const txns = await formBulkTransactions({
              program,
              rewards,
              assets: chunk.map((h) => new PublicKey(h.id)),
              compressionAssetAccs: chunk.map(solUtils.toAsset),
              lazyDistributor,
              assetEndpoint: anchorProvider.connection.rpcEndpoint,
              wallet: anchorProvider.wallet.publicKey,
            })

            const signedTxs = await anchorProvider.wallet.signAllTransactions(
              txns,
            )

            // eslint-disable-next-line @typescript-eslint/no-loop-func
            const txsWithSigs = signedTxs.map((tx, index) => ({
              transaction: chunk[index],
              sig: bs58.encode(
                !solUtils.isVersionedTransaction(tx)
                  ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    tx.signatures[0]!.signature!
                  : tx.signatures[0],
              ),
            }))

            // eslint-disable-next-line no-await-in-loop
            const confirmedTxs = await bulkSendRawTransactions(
              anchorProvider.connection,
              signedTxs.map((s) => s.serialize()),
              ({ totalProgress }) =>
                dispatch(
                  solanaSlice.actions.setPaymentProgress({
                    percent:
                      ((totalProgress + ret.length + thisRet.length) * 100) /
                      totalTxns,
                    text: `Confiming ${txns.length - totalProgress}/${
                      txns.length
                    } transactions.\n${
                      totalTxns - ret.length - thisRet.length
                    } total transactions remaining`,
                  }),
                ),
              recentBlockhash.lastValidBlockHeight,
              // Hail mary, try with preflight enabled. Sometimes this causes
              // errors that wouldn't otherwise happen
              triesRemaining !== 1,
            )
            thisRet.push(...confirmedTxs)
            if (confirmedTxs.length === signedTxs.length) {
              break
            }

            const retSet = new Set(thisRet)

            chunk = txsWithSigs
              .filter(({ sig }) => !retSet.has(sig))
              .map(({ transaction }) => transaction)

            triesRemaining -= 1
            if (triesRemaining <= 0) {
              throw new Error(
                `Failed to submit all txs after blockhashes expired, ${
                  signedTxs.length - confirmedTxs.length
                } remain`,
              )
            }
          }
          ret.push(...thisRet)
        }
      }

      // Claims are done, now we need to update the UI
      return ret
    } catch (error) {
      Logger.error(error)
      throw error
    }
  }
```
