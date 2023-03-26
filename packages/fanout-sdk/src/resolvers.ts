import {
  ataResolver,
  combineResolvers, heliumCommonResolver
} from "@helium/spl-utils";

export const fanoutResolvers = combineResolvers(
  heliumCommonResolver,
  ataResolver({
    instruction: "initializeFanoutV0",
    account: "tokenAccount",
    mint: "fanoutMint",
    owner: "fanout",
  }),
  ataResolver({
    instruction: "initializeFanoutV0",
    account: "collectionAccount",
    mint: "collection",
    owner: "authority",
  }),
  ataResolver({
    instruction: "stakeV0",
    account: "fromAccount",
    mint: "membershipMint",
    owner: "staker",
  }),
  ataResolver({
    instruction: "stakeV0",
    account: "stakeAccount",
    mint: "membershipMint",
    owner: "voucher",
  }),
  ataResolver({
    instruction: "stakeV0",
    account: "receiptAccount",
    mint: "mint",
    owner: "recipient",
  }),
  ataResolver({
    instruction: "unstakeV0",
    account: "receiptAccount",
    mint: "mint",
    owner: "voucherAuthority",
  }),
  ataResolver({
    instruction: "unstakeV0",
    account: "toAccount",
    mint: "membershipMint",
    owner: "voucherAuthority",
  }),
  ataResolver({
    instruction: "distributeV0",
    account: "receiptAccount",
    mint: "mint",
    owner: "owner",
  }),
  ataResolver({
    instruction: "distributeV0",
    account: "toAccount",
    mint: "fanoutMint",
    owner: "owner",
  })
);
