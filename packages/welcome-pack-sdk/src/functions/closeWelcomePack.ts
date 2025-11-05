import { IdlTypes, Program } from "@coral-xyz/anchor";
import { WelcomePack } from "@helium/idls/lib/types/welcome_pack";
import { Asset, AssetProof, proofArgsAndAccounts } from "@helium/spl-utils";
import { SPL_ACCOUNT_COMPRESSION_PROGRAM_ID } from "@solana/spl-account-compression";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { userWelcomePacksKey } from "..";
import { BUBBLEGUM_PROGRAM_ID, NOOP_PROGRAM_ID } from "./initializeWelcomePack";

export type RewardSplit = IdlTypes<WelcomePack>["miniFanoutShareArgV0"];

export async function closeWelcomePack({
  program,
  welcomePack,
  assetEndpoint,
  // @ts-ignore
  payer = program.provider.wallet.publicKey,
  ...rest
}: {
  welcomePack: PublicKey;
  program: Program<WelcomePack>;
  payer?: PublicKey;
  assetEndpoint?: string;
  getAssetFn?: (url: string, assetId: PublicKey) => Promise<Asset | undefined>;
  getAssetProofFn?: (
    url: string,
    assetId: PublicKey
  ) => Promise<AssetProof | undefined>;
}) {
  const welcomePackAcc = await program.account.welcomePackV0.fetch(welcomePack)
  const assetId = welcomePackAcc.asset
  const {
    args,
    accounts,
    remainingAccounts,
  } = await proofArgsAndAccounts({
    assetEndpoint,
    connection: program.provider.connection,
    assetId,
    ...rest,
  });

  return program.methods
    .closeWelcomePackV0({
      ...args,
    })
    .accountsStrict({
      welcomePack: welcomePack,
      owner: welcomePackAcc.owner,
      rentRefund: welcomePackAcc.rentRefund.equals(PublicKey.default) ? welcomePackAcc.owner : welcomePackAcc.rentRefund,
      treeAuthority: PublicKey.findProgramAddressSync([accounts.merkleTree.toBuffer()], BUBBLEGUM_PROGRAM_ID)[0],
      merkleTree: accounts.merkleTree,
      logWrapper: NOOP_PROGRAM_ID,
      compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      bubblegumProgram: BUBBLEGUM_PROGRAM_ID,
      userWelcomePacks: userWelcomePacksKey(welcomePackAcc.owner)[0]
    })
    .remainingAccounts(remainingAccounts);
}
