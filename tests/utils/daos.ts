import * as anchor from "@project-serum/anchor";
import { BN } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { HeliumSubDaos } from "../../target/types/helium_sub_daos";
import { createAtaAndMint, createMint } from "./token";

export async function initTestDao(
  program: anchor.Program<HeliumSubDaos>,
  provider: anchor.AnchorProvider,
  epochRewards: number,
  authority: PublicKey,
  dcMint?: PublicKey,
  mint?: PublicKey
): Promise<{
  mint: PublicKey;
  dao: PublicKey;
}> {
  const me = provider.wallet.publicKey;
  if (!mint) {
    mint = await createMint(provider, 6, me, me);
  }

  if (!dcMint) {
    dcMint = await createMint(provider, 6, me, me);
  }

  const method = await program.methods
    .initializeDaoV0({
      authority: authority,
      rewardPerEpoch: new BN(epochRewards)
    })
    .accounts({
      mint,
      dcMint
    });
  const { dao } = await method.pubkeys();

  if (!(await provider.connection.getAccountInfo(dao!))) {
    await method.rpc({ skipPreflight: true });
  }

  return { mint, dao: dao! };
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
  await method.rpc({ skipPreflight: true });

  return { mint: subDaoMint, subDao: subDao!, treasury };
}