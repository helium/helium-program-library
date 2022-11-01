import {
  ataResolver,
  combineResolvers,
  resolveIndividual
} from "@helium/spl-utils";
import { PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
import { getAccount, getAssociatedTokenAddress } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { circuitBreakerResolvers } from "@helium/circuit-breaker-sdk";

export const lazyDistributorResolvers = combineResolvers(
  ataResolver({
    instruction: "initializeLazyDistributorV0",
    account: "rewardsEscrow",
    mint: "rewardsMint",
    owner: "lazyDistributor",
  }),
  circuitBreakerResolvers,
  resolveIndividual(async ({ path, accounts, idlIx }) => {
    if (path[path.length - 1] === "targetMetadata") {
      if (!accounts.mint) {
        console.log(path, accounts, idlIx);
      }
      return (
        await PublicKey.findProgramAddress(
          [
            Buffer.from("metadata", "utf-8"),
            TOKEN_METADATA_PROGRAM_ID.toBuffer(),
            (accounts.mint as PublicKey).toBuffer(),
          ],
          TOKEN_METADATA_PROGRAM_ID
        )
      )[0];
    }
  }),
  async ({ accounts, provider, idlIx }) => {
    let resolved = 0;
    if (
      idlIx.name === "distributeRewardsV0" &&
      (!accounts.recipientMintAccount ||
        !accounts.destinationAccount ||
        !accounts.owner)
    ) {
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
      const destinationAccount = await getAssociatedTokenAddress(
        accounts.rewardsMint as PublicKey,
        recipientMintTokenAccount.owner
      );
      accounts.owner = recipientMintTokenAccount.owner;
      accounts.destinationAccount = destinationAccount;
      accounts.recipientMintAccount = recipientMintAccount;
      resolved += 1;
    }

    return {
      accounts,
      resolved,
    };
  }
);
