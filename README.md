# Helium Program Library

A collection of solana programs used for Helium's Solana integration


## Lazy Distributor

The lazy distributor is an oracle-powered token distributor that distributes tokens to holders
of particular NFTs as specified by oracles.


### Oracle Architecture

In order to facilitate setting rewards _and_ distributing rewards in a single Solana transaction,
I propose at the url specified in the oracle configuration, supporting `GET` and `POST` 

#### GET Request

Request current rewards for the hotspot. Provide `?mint=...` query param with the hotspot mint.

Which should return

```
{
  "currentRewards": ...
}
```

#### POST Request

Sign transaction to set rewards and distribute
```
{
  transaction: ... // serialized transaction
}
```

Which should return

```
{
  transaction: ... // signed transaction
}
```

Before signing the transaction, the oracle should validate (1) that the transaction contains only

  * `setCurrentRewards` instructions from other validators
  * distribute instructions

and (2) that the amount set for `setCurrentRewards` for itself is correct.


#### Client Side

The client should:

  * Submit requests to all oracles to get the current total rewards amount
  * Form instructions to set rewards from all oracles using their specified rewards amount
  * Submit a sign transaction request to all oracles sequentially
  * Submit the signed transaction to Solana
