# Sus

Ever wonder if a given transaction in Sus? Have difficulty parsing the cryptic return of a transaction simulation? This repo is for you!

Solana transactions are notoriously hard to parse, but it is extremely important that users understand what they are approving. This library is an attempt to bridge that gap as best we can.

Features:

  * List human-readable forms of writable accounts
  * Parse all anchor instructions and accounts on programs with published IDLs
  * Create warnings around suspicious activity
  * Human-readable balance changes with token tickers
  * Detect balance changes on cNFTs
  * Explorer link to simulated transaction
  * Parse out base and priority fees
  * Flag writable accounts that did not change in simulation
  * Batch as many fetches as possible into getMultipleAccounts to reduce load on RPC

## Usage

```javascript
import { sus } from "@helium/sus"

const result = await sus({
  connection,
  wallet,
  serializedTransactions: [transaction.serialize({
    verifySignatures: false,
    requireAllSignatures: false,
  })],
  // Check for cNFT changes, this only works if you have an RPC with DAS support
  checkCNfts: true,
  // Necessary for explorer link
  cluster: "devnet"
})
console.log(result)
```

## Human-readable Writable Accounts (and changes)

On Solana, every transaction must declare which accounts can be changed over the course of a transaction. This is an important way to detect bad behavior. If a transaction is meant to swap SOL for HNT and it labels your USDC account as writable, this is a problem!

Transaction simulation is not a silver bullet, it can be tricked. We cannot rely on simulated balance changes to reflect what _can_ happen in a transaction. As such, we should flag which important accounts are at risk.

This feature also allows us to show a detailed diff on fields that change on anchor accounts. For example, we may see a helium `IotHotspotInfoV0.location` changed from one value to another in simulation.

```javascript
const result = await sus({
  connection,
  wallet,
  serializedTransactions: [transaction.serialize({
    verifySignatures: false,
    requireAllSignatures: false,
  })],
  // Check for cNFT changes, this only works if you have an RPC with DAS support
  checkCNfts: true,
  // Necessary for explorer link
  cluster: "devnet"
})
console.log(result[0].writableAccounts)
```

Consider a transaction that mints helium data credits by burning HNT. This will return something like this. Note the owner field is best-effort but allows a UI to display which accounts may be owned by the user.:

```javascript
[
  {
    address: sustWW3deA7acADNGJnkYj2EAf65EmqUNLxKekDpu6w,
    name: 'Native SOL Account',
    owner: sustWW3deA7acADNGJnkYj2EAf65EmqUNLxKekDpu6w
    pre: { type: 'NativeAccount', account: [Object], parsed: null },
    post: { type: 'NativeAccount', account: [Object], parsed: null },
    changedInSimulation: true,
    metadata: undefined
  },
  {
    address: 7KjyaNK3qRAsA4WHGzyJGDJQAJKeQmnujKbPmP3sVpzT,
    name: 'DelegatedDataCreditsV0',
    owner: undefined,
    pre: {
      type: 'DelegatedDataCreditsV0',
      account: null,
      parsed: undefined
    },
    post: {
      type: 'DelegatedDataCreditsV0',
      account: [Object],
      parsed: [Object]
    },
    changedInSimulation: true,
    metadata: undefined
  },
  {
    address: dcuc8Amr83Wz27ZkQ2K9NS6r8zRpf1J6cvArEBDZDmm,
    name: 'DC Mint',
    owner: undefined,
    pre: { type: 'Mint', account: [Object], parsed: [Object] },
    post: { type: 'Mint', account: [Object], parsed: [Object] },
    changedInSimulation: true,
    metadata: {
      name: 'Helium Data Credit',
      symbol: 'DC',
      uri: 'https://shdw-drive.genesysgo.net/CsDkETHRRR1EcueeN346MJoqzymkkr7RFjMqGpZMzAib/dc.json',
      decimals: 0,
      mint: dcuc8Amr83Wz27ZkQ2K9NS6r8zRpf1J6cvArEBDZDmm
    }
  },
  {
    address: EP1jYSgzfaMWr8z4gceoEdh3agfTyV2wL8Br1dHhzRVC,,
    name: 'DC Token Account',
    owner: sustWW3deA7acADNGJnkYj2EAf65EmqUNLxKekDpu6w,
    pre: { type: 'TokenAccount', account: null, parsed: undefined },
    post: { type: 'TokenAccount', account: [Object], parsed: [Object] },
    changedInSimulation: true,
    metadata: {
      name: 'Helium Data Credit',
      symbol: 'DC',
      uri: 'https://shdw-drive.genesysgo.net/CsDkETHRRR1EcueeN346MJoqzymkkr7RFjMqGpZMzAib/dc.json',
      decimals: 0,
      mint: dcuc8Amr83Wz27ZkQ2K9NS6r8zRpf1J6cvArEBDZDmm
    }
  },
  {
    address: FzLQKNNe67QgPJnUJyZ2zrNBqmjYaBYgoaYh69Yitn8Q.
    name: 'HNT Token Account',
    owner: sustWW3deA7acADNGJnkYj2EAf65EmqUNLxKekDpu6w,
    pre: { type: 'TokenAccount', account: [Object], parsed: [Object] },
    post: { type: 'TokenAccount', account: [Object], parsed: [Object] },
    changedInSimulation: true,
    metadata: {
      name: 'Helium Network Token',
      symbol: 'HNT',
      uri: 'https://shdw-drive.genesysgo.net/CsDkETHRRR1EcueeN346MJoqzymkkr7RFjMqGpZMzAib/hnt.json',
      decimals: 8,
      mint: hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux
    }
  },
  {
    address: hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux,
    name: 'HNT Mint',
    owner: undefined,
    pre: { type: 'Mint', account: [Object], parsed: [Object] },
    post: { type: 'Mint', account: [Object], parsed: [Object] },
    changedInSimulation: true,
    metadata: {
      name: 'Helium Network Token',
      symbol: 'HNT',
      uri: 'https://shdw-drive.genesysgo.net/CsDkETHRRR1EcueeN346MJoqzymkkr7RFjMqGpZMzAib/hnt.json',
      decimals: 8,
      mint: [PublicKey [PublicKey(hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux)]]
    }
  },
  {
    address: kM5w7CoX6NNZZuV3D17FUfjktMQ8tsU542giQx214QB,
    name: 'DC Token Account',
    owner: 7KjyaNK3qRAsA4WHGzyJGDJQAJKeQmnujKbPmP3sVpzT,
    pre: { type: 'TokenAccount', account: null, parsed: undefined },
    post: { type: 'TokenAccount', account: [Object], parsed: [Object] },
    changedInSimulation: true,
    metadata: {
      name: 'Helium Data Credit',
      symbol: 'DC',
      uri: 'https://shdw-drive.genesysgo.net/CsDkETHRRR1EcueeN346MJoqzymkkr7RFjMqGpZMzAib/dc.json',
      decimals: 0,
      mint: [PublicKey [PublicKey(dcuc8Amr83Wz27ZkQ2K9NS6r8zRpf1J6cvArEBDZDmm)]]
    }
  },
  {
    address: sZgXQVqAv9atfSuwNJnHgSf4tqsos6kRajANmBaBmSx,
    name: 'MintWindowedCircuitBreakerV0',
    owner: undefined,
    pre: {
      type: 'MintWindowedCircuitBreakerV0',
      account: [Object],
      parsed: [Object]
    },
    post: {
      type: 'MintWindowedCircuitBreakerV0',
      account: [Object],
      parsed: [Object]
    },
    changedInSimulation: true,
    metadata: undefined
  }
]
```

The `parsed` field in the pre-transaction and post-transaction changes will contain the anchor deserialized accounts as an object.

## Parsed Anchor instructions

An important part of understanding what a transaction does is seeing a human-readable form of what actions are being taken and their argument.

Sus attempts to parse the instructions of any program with an anchor-compliant IDL. This allows you to display the actions, their arguments, and the accounts being used:


```javascript
const result = await sus({
  connection,
  wallet,
  serializedTransaction: [transaction.serialize({
    verifySignatures: false,
    requireAllSignatures: false,
  })],
  // Check for cNFT changes, this only works if you have an RPC with DAS support
  checkCNfts: true,
  // Necessary for explorer link
  cluster: "devnet"
})
console.log(result[0].instructions)
```

Parsing results in the following data:

```javascript
[
  {
    parsed: {
      name: 'mintDataCreditsV0',
      data: { args: { hntAmount: null, dcAmount: <BN: a> } },
      accounts: [
        {
          name: 'Data Credits',
          pubkey: [PublicKey [PublicKey(D1LbvrJQ9K2WbGPMbM3Fnrf5PSsDH1TDpjqJdHuvs81n)]],
          isSigner: false,
          isWritable: false
        },
        {
          name: 'Hnt Price Oracle',
          pubkey: [PublicKey [PublicKey(4DdmDswskDxXGpwHrXUfn2CNUm9rt21ac79GHNTN3J33)]],
          isSigner: false,
          isWritable: false
        },
        {
          name: 'Burner',
          pubkey: [PublicKey [PublicKey(FzLQKNNe67QgPJnUJyZ2zrNBqmjYaBYgoaYh69Yitn8Q)]],
          isSigner: false,
          isWritable: true
        },
        {
          name: 'Recipient Token Account',
          pubkey: [PublicKey [PublicKey(EP1jYSgzfaMWr8z4gceoEdh3agfTyV2wL8Br1dHhzRVC)]],
          isSigner: false,
          isWritable: true
        },
        {
          name: 'Recipient',
          pubkey: [PublicKey [PublicKey(sustWW3deA7acADNGJnkYj2EAf65EmqUNLxKekDpu6w)]],
          isSigner: true,
          isWritable: true
        },
        {
          name: 'Owner',
          pubkey: [PublicKey [PublicKey(sustWW3deA7acADNGJnkYj2EAf65EmqUNLxKekDpu6w)]],
          isSigner: true,
          isWritable: true
        },
        {
          name: 'Hnt Mint',
          pubkey: [PublicKey [PublicKey(hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux)]],
          isSigner: false,
          isWritable: true
        },
        {
          name: 'Dc Mint',
          pubkey: [PublicKey [PublicKey(dcuc8Amr83Wz27ZkQ2K9NS6r8zRpf1J6cvArEBDZDmm)]],
          isSigner: false,
          isWritable: true
        },
        {
          name: 'Circuit Breaker',
          pubkey: [PublicKey [PublicKey(sZgXQVqAv9atfSuwNJnHgSf4tqsos6kRajANmBaBmSx)]],
          isSigner: false,
          isWritable: true
        },
        {
          name: 'Circuit Breaker Program',
          pubkey: [PublicKey [PublicKey(circAbx64bbsscPbQzZAUvuXpHqrCe6fLMzc2uKXz9g)]],
          isSigner: false,
          isWritable: false
        },
        {
          name: 'Token Program',
          pubkey: [PublicKey [PublicKey(TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA)]],
          isSigner: false,
          isWritable: false
        },
        {
          name: 'System Program',
          pubkey: [PublicKey [PublicKey(11111111111111111111111111111111)]],
          isSigner: false,
          isWritable: false
        },
        {
          name: 'Associated Token Program',
          pubkey: [PublicKey [PublicKey(ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL)]],
          isSigner: false,
          isWritable: false
        }
      ]
    },
    raw: {
      data: <Buffer 4e 6d a9 84 90 5e dd 39 00 01 0a 00 00 00 00 00 00 00>,
      programId: credMBJhYFzfn7NxBMdU4aUqFggAjgztaCcv2Fo6fPT,
      accounts: [Array]
    }
  },
  {
    parsed: {
      name: 'delegateDataCreditsV0',
      data: [Object],
      accounts: [Array]
    },
    raw: {
      data: <Buffer 9a 38 e2 80 a2 73 e2 05 0a 00 00 00 00 00 00 00 03 00 00 00 46 6f 6f>,
      programId: [PublicKey [PublicKey(credMBJhYFzfn7NxBMdU4aUqFggAjgztaCcv2Fo6fPT)]],
      accounts: [Array]
    }
  }
]
```

## Warnings

Sus attempts to warn for various suspicious transactions. One example is a transaction that sets more than 2 token accounts to writable. A normal swap involves two accounts, so 6 token accounts being writable may be perceived as a rug:

```javascript
const result = await sus({
  connection,
  wallet,
  serializedTransaction: [transaction.serialize({
    verifySignatures: false,
    requireAllSignatures: false,
  })],
  // Check for cNFT changes, this only works if you have an RPC with DAS support
  checkCNfts: true,
  // Necessary for explorer link
  cluster: "devnet"
})
console.log(result[0].warnings)
```

```javascript
[
  {
    severity: 'warning',
    message: "More than 2 accounts with negative balance change. Is this emptying your wallet?",
    shortMessage: '2+ Writable'
  }
]
```

## Human-readable balance changes with token tickers

Balance changes need to be paired with token symbols/tickers to create useful human-redable changes.

```javascript
import { sus } from "@helium/sus"

const result = await sus({
  connection,
  wallet,
  serializedTransaction: [transaction.serialize({
    verifySignatures: false,
    requireAllSignatures: false,
  })],
  // Check for cNFT changes, this only works if you have an RPC with DAS support
  checkCNfts: true,
  // Necessary for explorer link
  cluster: "devnet"
})
console.log(result[0].balanceChanges)
```

```javascript
[
  {
    owner: PublicKey [PublicKey(sustWW3deA7acADNGJnkYj2EAf65EmqUNLxKekDpu6w)] {
      _bn: <BN: d0ad43fd01001ce7196306585b6c7b0d5d9143609a1c2d2da2fbe1094ea4de0>
    },
    address: PublicKey [PublicKey(sustWW3deA7acADNGJnkYj2EAf65EmqUNLxKekDpu6w)] {
      _bn: <BN: d0ad43fd01001ce7196306585b6c7b0d5d9143609a1c2d2da2fbe1094ea4de0>
    },
    amount: -2044280n,
    metadata: {
      mint: [PublicKey [PublicKey(So11111111111111111111111111111111111111112)]],
      decimals: 9,
      name: 'SOL',
      symbol: 'SOL'
    }
  },
  {
    owner: PublicKey [PublicKey(11111111111111111111111111111111)] {
      _bn: <BN: 0>
    },
    address: PublicKey [PublicKey(5pcFdhUfokbCKuQv8id7GV1ZFGWLt2vBEDGX76QxkpxW)] {
      _bn: <BN: 47a0e7d6cdf04ee6fcb69fc1538bcbb28c1419493986e98ed691da963bce74f7>
    },
    amount: 1000000000n,
    metadata: {
      name: 'Helium Network Token',
      symbol: 'HNT',
      uri: 'https://shdw-drive.genesysgo.net/CsDkETHRRR1EcueeN346MJoqzymkkr7RFjMqGpZMzAib/hnt.json',
      decimals: 8,
      mint: [PublicKey [PublicKey(hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux)]]
    }
  },
  {
    owner: PublicKey [PublicKey(sustWW3deA7acADNGJnkYj2EAf65EmqUNLxKekDpu6w)] {
      _bn: <BN: d0ad43fd01001ce7196306585b6c7b0d5d9143609a1c2d2da2fbe1094ea4de0>
    },
    address: PublicKey [PublicKey(FzLQKNNe67QgPJnUJyZ2zrNBqmjYaBYgoaYh69Yitn8Q)] {
      _bn: <BN: deb3a93807100fa36efe96aa2c97b5942a5582f005c99e0d2c2ece93499cf569>
    },
    amount: -1000000000n,
    metadata: {
      name: 'Helium Network Token',
      symbol: 'HNT',
      uri: 'https://shdw-drive.genesysgo.net/CsDkETHRRR1EcueeN346MJoqzymkkr7RFjMqGpZMzAib/hnt.json',
      decimals: 8,
      mint: [PublicKey [PublicKey(hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux)]]
    }
  }
]
```

## Possible cNFT Balance Changes

Traditional transaction simulation shows the changes in balance of typical token accounts. This is, unfortunately, not directly possible with cNFTs. However, we can make a best effort by observing which assets in a wallet belong to a merkle tree that is labeled as writable. This allows us to flag that a cNFT _might_ be transferred, burned, or updated.

To use this feature, you must either (a) use an RPC with DAS support or pass the `cNfts` arg with an array of cNFTs already in the wallet. You must also enable the `checkCNfts` param.

```javascript
import { sus } from "@helium/sus"

const result = await sus({
  connection,
  wallet,
  serializedTransaction: [transaction.serialize({
    verifySignatures: false,
    requireAllSignatures: false,
  })],
  // Check for cNFT changes, this only works if you have an RPC with DAS support
  checkCNfts: true,
  // Necessary for explorer link
  cluster: "devnet"
})
console.log(result[0].possibleCNftChanges)
```

Unfortunately, this method is limited by how much data can be fetched from DAS. If a user has more than 200 hotspots, for example, Sus will not be able to check all hotspots past that limit for matches to a mutable tree in the transaction.

`possibleCNftChanges` will contain a list of DAS assets that could be changed in this tx.

## Explorer Link

It is sometimes useful to inspect a simulated transaction in the solana explorer. `susResult.explorerLink` will give you a valid explorer link to inspect the transaction. Note that you will also need to provide the `cluster` param for explorer.

## Base and Priority Fees

Sus will tell you both the base fee and the priority fees on a transaction. This is through `susResult.priorityFee` and `susResult.solFee`.

