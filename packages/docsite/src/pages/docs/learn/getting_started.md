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

### Generate and send claim txn for a hotspot

```js async name=claim-hotspot-reward
import { AnchorProvider } from '@coral-xyz/anchor'
import { daoKey } from '@helium/helium-sub-daos-sdk'
import { bs58 } from '@coral-xyz/anchor/dist/cjs/utils/bytes'
import {
  init as initHem,
  keyToAssetKey,
} from '@helium/helium-entity-manager-sdk'
import * as client from '@helium/distributor-oracle'
import { init as initLazy, recipientKey } from '@helium/lazy-distributor-sdk'
import {
  bulkSendRawTransactions,
  Asset,
  HNT_MINT,
  MOBILE_MINT,
} from '@helium/spl-utils'
import { lazyDistributorKey } from '@helium/lazy-distributor-sdk'
import { PublicKey } from '@solana/web3.js'

export const MOBILE_LAZY_KEY = lazyDistributorKey(MOBILE_MINT)[0]

export type HotspotWithPendingRewards = Asset & {
  // mint id to pending rewards
  pendingRewards: Record<string, string> | undefined,
}

export const claimHotspotReward = async ({
  publicAddress,
  provider,
  hotspot,
}: {
  publicAddress: string,
  provider: AnchorProvider,
  hotspot: HotspotWithPendingRewards,
}) => {
  const hemProgram = await initHem(provider)

  const [entityKey] = keyToAssetKey(
    daoKey(HNT_MINT)[0],
    bs58.decode(hotspot?.content?.json_uri?.split('/')?.slice(-1)?.[0])
  )

  const keyToAsset = await hemProgram.account.keyToAssetV0.fetchNullable(
    entityKey
  )

  const recipient = new PublicKey(publicAddress)

  const asset = keyToAsset?.asset

  const lazyDistributorProgram = await initLazy(provider)

  const lazyDistributor = MOBILE_LAZY_KEY

  if (!asset) {
    throw new Error('No asset found')
  }

  const recipientK = recipientKey(lazyDistributor, asset)

  const recipientAcc = await lazyDistributorProgram.account.recipientV0.fetchNullable(
    recipientK[0]
  )

  if (!recipientAcc) {
    throw new Error('Recipient account not found')
  }

  const rewards = await client.getCurrentRewards(
    lazyDistributorProgram,
    lazyDistributor,
    asset
  )

  // Creating claim txn with helium mobile wallet as fee payer
  const claimTxn = await client.formTransaction({
    program: lazyDistributorProgram,
    provider,
    rewards,
    asset: asset,
    lazyDistributor: MOBILE_LAZY_KEY,
    assetEndpoint: provider.connection.rpcEndpoint,
    wallet: recipient,
    payer: provider.wallet.publicKey,
  })

  const signedTxn = await provider.wallet.signTransaction(claimTxn)

  const serializedTxn = signedTxn.serialize()

  const sigs = await bulkSendRawTransactions(provider.connection, [
    serializedTxn,
  ])

  return sigs
}
```
