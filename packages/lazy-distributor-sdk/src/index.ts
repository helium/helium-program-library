import { ataResolver, combineResolvers, resolveIndividual } from "@helium-foundation/spl-utils";
import { PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
import { AnchorProvider, Program } from "@project-serum/anchor";
import { getAccount, getAssociatedTokenAddress } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { LazyDistributor } from "../../../target/types/lazy_distributor";
import { PROGRAM_ID } from "./constants";

export async function init(
  provider: AnchorProvider,
  lazyDistributorProgramId: PublicKey = PROGRAM_ID,
  lazyDistributorIdl?: any
): Promise<Program<LazyDistributor>> {
  if (!lazyDistributorIdl) {
    lazyDistributorIdl = await Program.fetchIdl(lazyDistributorProgramId, provider);
  }
  const lazyDistributor = new Program<LazyDistributor>(
    lazyDistributorIdl as LazyDistributor,
    lazyDistributorProgramId,
    provider,
    undefined,
    () => {
      return lazyDistributorResolvers;
    }
  ) as Program<LazyDistributor>;
  return lazyDistributor;
}

export const lazyDistributorResolvers = combineResolvers(
  resolveIndividual(async ({ path, accounts }) => {
    if (path[path.length - 1] === "targetMetadata") {
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
    if (idlIx.name === "distributeRewardsV0" && (!accounts.recipientMintAccount || !accounts.destinationAccount)) {
      const recipient = accounts.recipient as PublicKey;
      const recipientAcc = await provider.connection.getAccountInfo(recipient);
      const recipientMint = new PublicKey(
        recipientAcc!.data.subarray(8 + 32, 8 + 32 + 32)
      );
      const recipientMintAccount = (await provider.connection.getTokenLargestAccounts(recipientMint)).value[0].address;
      const recipientMintTokenAccount = await getAccount(provider.connection, recipientMintAccount);
      const destinationAccount = await getAssociatedTokenAddress(
        accounts.rewardsMint as PublicKey,
        recipientMintTokenAccount.owner
      )
      accounts.owner = recipientMintTokenAccount.owner;
      accounts.destinationAccount = destinationAccount;
      accounts.recipientMintAccount = recipientMintAccount;
    }

    return accounts
  },
);


export * from "./constants";
export * from "./pdas";

