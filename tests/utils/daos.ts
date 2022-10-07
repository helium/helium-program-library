import { sendInstructions } from "@helium-foundation/spl-utils";
import { AccountLayout } from "@solana/spl-token";
import * as anchor from "@project-serum/anchor";
import { BN, Program } from "@project-serum/anchor";
import { SystemProgram, PublicKey, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import { heliumSubDaosResolvers } from "../../packages/helium-sub-daos-sdk/src";
import { HeliumSubDaos } from "../../target/types/helium_sub_daos";
import { TestTracker } from "../../target/types/test_tracker";
import { createAtaAndMint, createMint, mintTo } from "./token";

export async function initTestDao(
  program: anchor.Program<HeliumSubDaos>,
  provider: anchor.AnchorProvider,
  epochRewards: number,
  authority: PublicKey,
  mint?: PublicKey
): Promise<{
  mint: PublicKey;
  dao: PublicKey;
  treasury: PublicKey;
}> {
  if (!mint) {
    mint = await createMint(provider, 6, authority, authority);
  }

  const method = await program.methods
    .initializeDaoV0({
      authority: authority,
      rewardPerEpoch: new BN(epochRewards)
    })
    .accounts({
      mint,
    });
  const { dao, treasury } = await method.pubkeys();

  if (!(await provider.connection.getAccountInfo(dao!))) {
    await method.rpc();
  }

  return { mint, dao: dao!, treasury: treasury! };
}

export async function initTestSubdao(
  program: anchor.Program<HeliumSubDaos>,
  provider: anchor.AnchorProvider,
  authority: PublicKey,
  dao: PublicKey,
  collection: PublicKey,
): Promise<{
  mint: PublicKey;
  subDao: PublicKey;
  treasury: PublicKey;
}> {
  const daoAcc = await program.account.daoV0.fetch(dao);
  const subDaoMint = await createMint(provider, 6, authority, authority);
  const treasury = await createAtaAndMint(provider, daoAcc.mint, 0);
  const method = await program.methods
    .initializeSubDaoV0({
      authority: authority,
    })
    .accounts({
      dao,
      subDaoMint,
      hotspotCollection: collection,
      treasury,
      mint: daoAcc.mint,
    });
  const { subDao } = await method.pubkeys();
  await method.rpc();

  return { mint: subDaoMint, subDao: subDao!, treasury };
}