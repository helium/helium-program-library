import {
  AnchorProvider,
  Program,
  BN,
  BorshInstructionCoder,
} from "@project-serum/anchor";
import { PublicKey, Transaction } from "@solana/web3.js";
import { LazyDistributor } from "@helium-foundation/idls/lib/types/lazy_distributor";
import axios from "axios";
import { recipientKey } from "@helium-foundation/lazy-distributor-sdk";
import { getAccount, getAssociatedTokenAddress } from "@solana/spl-token";


export type Reward = {
  currentRewards: string;
  oracleKey: PublicKey;
};
export async function getCurrentRewards(
  program: Program<LazyDistributor>,
  lazyDistributor: PublicKey,
  mint: PublicKey
): Promise<Reward[]> {
  const lazyDistributorAcc = await program.account.lazyDistributorV0.fetch(
    lazyDistributor
  );

  const results = await Promise.all(
    lazyDistributorAcc.oracles.map((x) =>
      axios.get(`${x.url}?mint=${mint.toBase58()}`)
    )
  );
  return results.map((x, idx) => {
    return {
      currentRewards: x.data.currentRewards,
      oracleKey: lazyDistributorAcc.oracles[idx].oracle,
    };
  });
}

export async function formTransaction(
  program: Program<LazyDistributor>,
  provider: AnchorProvider,
  rewards: Reward[],
  hotspot: PublicKey,
  lazyDistributor: PublicKey
) {
  const recipient = (await recipientKey(lazyDistributor, hotspot))[0]
  const ixPromises = rewards.map((x, idx) => {
    return program.methods
      .setCurrentRewardsV0({
        currentRewards: new BN(x.currentRewards),
        oracleIndex: idx,
      })
      .accounts({
        lazyDistributor,
        recipient,
        oracle: x.oracleKey,
      })
      .instruction();
  });
  const ixs = await Promise.all(ixPromises);
  let tx = new Transaction();
  if (!await provider.connection.getAccountInfo(recipient)) {
    const ix = await program.methods.initializeRecipientV0().accounts({
      lazyDistributor,
      mint: hotspot
    }).instruction()
    tx.add(ix);
  }
  tx.add(...ixs);

  const holders = await provider.connection.getTokenLargestAccounts(hotspot);
  const mintAccount = holders.value[0].address;
  const mintTokenAccount = await getAccount(provider.connection, mintAccount);
  const rewardsMint = (await program.account.lazyDistributorV0.fetch(lazyDistributor)).rewardsMint;

  const distributeIx = await program.methods
    .distributeRewardsV0()
    .accounts({
      recipient,
      lazyDistributor,
      recipientMintAccount: mintAccount,
      owner: mintTokenAccount.owner,
      rewardsMint,
      destinationAccount: await getAssociatedTokenAddress(
        rewardsMint,
        mintTokenAccount.owner
      )
    })
    .instruction();

  tx.recentBlockhash = (
    await provider.connection.getLatestBlockhash()
  ).blockhash;

  tx.feePayer = provider.wallet.publicKey;

  tx.add(distributeIx);
  tx = await provider.wallet.signTransaction(tx);

  return tx;
}
