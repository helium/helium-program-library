import {
  ataResolver,
  combineResolvers,
  resolveIndividual,
} from '@helium/anchor-resolvers';
import { getAccount, getAssociatedTokenAddress } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import { circuitBreakerResolvers } from '@helium/circuit-breaker-sdk';
import { recipientKey } from './pdas';
import { Accounts } from '@coral-xyz/anchor';
import { getLeafAssetId } from '@metaplex-foundation/mpl-bubblegum';
import { BN, red } from 'bn.js';

const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'
);

export const lazyDistributorResolvers = combineResolvers(
  resolveIndividual(async ({ path }) => {
    switch (path[path.length - 1]) {
      case 'tokenMetadataProgram':
        return new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
      case 'bubblegumProgram':
        return new PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY');
      case 'compressionProgram':
        return new PublicKey('cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK');
      case 'logWrapper':
        return new PublicKey('noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV');
      default:
        return;
    }
  }),
  ataResolver({
    instruction: 'initializeLazyDistributorV0',
    account: 'rewardsEscrow',
    mint: 'rewardsMint',
    owner: 'lazyDistributor',
  }),
  ataResolver({
    instruction: 'distributeRewardsV0',
    account: 'common.destinationAccount',
    mint: 'common.rewardsMint',
    owner: 'common.owner',
  }),
  ataResolver({
    instruction: 'distributeCompressionRewardsV0',
    account: 'common.destinationAccount',
    mint: 'common.rewardsMint',
    owner: 'common.owner',
  }),
  ataResolver({
    instruction: 'distributeCustomDestinationV0',
    account: 'common.destinationAccount',
    mint: 'common.rewardsMint',
    owner: 'common.owner',
  }),
  circuitBreakerResolvers,
  resolveIndividual(async ({ path, accounts, idlIx }) => {
    if (path[path.length - 1] === 'targetMetadata') {
      if (!accounts.mint) {
        console.log(path, accounts, idlIx);
      }
      return (
        await PublicKey.findProgramAddress(
          [
            Buffer.from('metadata', 'utf-8'),
            TOKEN_METADATA_PROGRAM_ID.toBuffer(),
            (accounts.mint as PublicKey).toBuffer(),
          ],
          TOKEN_METADATA_PROGRAM_ID
        )
      )[0];
    }
  }),
  async ({ accounts, idlIx, args }) => {
    let resolved = 0;
    const common = accounts.common as Accounts;
    if (
      idlIx.name === 'distributeCompressionRewardsV0' &&
      accounts.merkleTree &&
      common.lazyDistributor &&
      !common.recipient
    ) {
      common.recipient = recipientKey(
        common.lazyDistributor as PublicKey,
        await getLeafAssetId(
          accounts.merkleTree as PublicKey,
          new BN(args[0].index)
        )
      )[0];
      resolved++;
    }
    if (
      idlIx.name === 'distributeRewardsV0' &&
      accounts.mint &&
      accounts.lazyDistributor &&
      !common.recipient
    ) {
      common.recipient = recipientKey(
        common.lazyDistributor as PublicKey,
        accounts.mint as PublicKey
      )[0];
      resolved++;
    }

    return {
      resolved,
      accounts,
    };
  },
    async ({ accounts, provider, idlIx }) => {
    let resolved = 0;
    if (
      idlIx.name === 'updateDestinationV0' &&
      // @ts-ignore
      (!accounts.recipientMintAccount ||
        // @ts-ignore
        !accounts.owner)
    ) {
      // @ts-ignore
      const recipient = accounts.recipient as PublicKey;
      const recipientAcc = await provider.connection.getAccountInfo(recipient);
      const recipientMint = new PublicKey(
        recipientAcc!.data.subarray(8 + 32, 8 + 32 + 32)
      );
      const recipientMintAccount = (
        await provider.connection.getTokenLargestAccounts(recipientMint)
      ).value[0].address;
      const recipientMintTokenAccount = await getAccount(
        provider.connection,
        recipientMintAccount
      );
      // @ts-ignore
      accounts.owner = recipientMintTokenAccount.owner;
      // @ts-ignore
      accounts.recipientMintAccount = recipientMintAccount;
      resolved += 1;
    }

    return {
      accounts,
      resolved,
    };
  },
  async ({ accounts, provider, idlIx }) => {
    let resolved = 0;
    if (
      idlIx.name === 'distributeRewardsV0' &&
      // @ts-ignore
      (!accounts.recipientMintAccount ||
        // @ts-ignore
        !accounts.common.destinationAccount ||
        // @ts-ignore
        !accounts.common.owner)
    ) {
      // @ts-ignore
      const recipient = accounts.common.recipient as PublicKey;
      const recipientAcc = await provider.connection.getAccountInfo(recipient);
      const recipientMint = new PublicKey(
        recipientAcc!.data.subarray(8 + 32, 8 + 32 + 32)
      );
      const recipientMintAccount = (
        await provider.connection.getTokenLargestAccounts(recipientMint)
      ).value[0].address;
      const recipientMintTokenAccount = await getAccount(
        provider.connection,
        recipientMintAccount
      );
      const destinationAccount = await getAssociatedTokenAddress(
        // @ts-ignore
        accounts.common.rewardsMint as PublicKey,
        recipientMintTokenAccount.owner,
        true
      );
      // @ts-ignore
      accounts.common.owner = recipientMintTokenAccount.owner;
      // @ts-ignore
      accounts.common.destinationAccount = destinationAccount;
      accounts.recipientMintAccount = recipientMintAccount;
      resolved += 1;
    }

    return {
      accounts,
      resolved,
    };
  }
);
