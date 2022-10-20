import * as anchor from "@project-serum/anchor";
import { BN } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { HeliumSubDaos } from "../../target/types/helium_sub_daos";
import { createAtaAndMint, createMint } from "@helium-foundation/spl-utils";

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
      emissionSchedule: [
        {
          startUnixTime: new anchor.BN(0),
          emissionsPerEpoch: new BN(epochRewards),
        },
      ],
    })
    .accounts({
      hntMint: mint,
      dcMint,
    });
  const { dao } = await method.pubkeys();

  if (!(await provider.connection.getAccountInfo(dao!))) {
    await method.rpc({ skipPreflight: true });
  }

  return { mint: mint!, dao: dao! };
}

export async function initTestSubdao(
  program: anchor.Program<HeliumSubDaos>,
  provider: anchor.AnchorProvider,
  authority: PublicKey,
  dao: PublicKey,
  collection: PublicKey,
  epochRewards?: number
): Promise<{
  mint: PublicKey;
  subDao: PublicKey;
  treasury: PublicKey;
  rewardsEscrow: PublicKey;
}> {
  const daoAcc = await program.account.daoV0.fetch(dao);
  const dntMint = await createMint(provider, 6, authority, authority);
  const treasury = await createAtaAndMint(provider, daoAcc.hntMint, 0);
  const rewardsEscrow = await createAtaAndMint(provider, dntMint, 0, provider.wallet.publicKey)
  const method = await program.methods
    .initializeSubDaoV0({
      authority: authority,
      emissionSchedule: [
        {
          startUnixTime: new anchor.BN(0),
          emissionsPerEpoch: new BN(epochRewards || 10),
        },
      ],
    })
    .accounts({
      dao,
      rewardsEscrow,
      dntMint,
      hotspotCollection: collection,
      treasury,
      hntMint: daoAcc.hntMint,
    });
  const { subDao } = await method.pubkeys();
  await method.rpc({ skipPreflight: true });

  return { mint: dntMint, subDao: subDao!, treasury, rewardsEscrow };
}