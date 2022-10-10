import { AnchorProvider, Program, BN, BorshInstructionCoder } from "@project-serum/anchor";
import { PublicKey, Transaction } from "@solana/web3.js";
import { LazyDistributor } from "../../../target/types/lazy_distributor";
import axios from 'axios';

export type Reward = {
  currentRewards: number | string,
  oracleKey: PublicKey,
}
export async function getCurrentRewards(
  program: Program<LazyDistributor>, 
  lazyDistributor: PublicKey, 
  mint: PublicKey): Promise<Reward[]> {
  const lazyDistributorAcc = await program.account.lazyDistributorV0.fetch(lazyDistributor);
  console.log(lazyDistributorAcc.oracles);
  const promises: Promise<any>[] = [];
  //@ts-ignore
  for (const oracle of lazyDistributorAcc.oracles) {
    promises.push(
      axios.get(`${oracle.url}/?mint=${mint.toString()}`)
    )
  }
  const results = await Promise.all(promises);
  return results.map((x, idx) => {
    return {
      currentRewards: x,
      oracleKey: lazyDistributorAcc.oracles[idx].oracle,
    }
  })
}

export async function formTransaction(
  program: Program<LazyDistributor>, 
  provider: AnchorProvider,
  rewards: Reward[], 
  recipient: PublicKey,
  lazyDistributor: PublicKey) {
  const lazyDistributorAcc = await program.account.lazyDistributorV0.fetch(lazyDistributor);
  const ixPromises = rewards.map((x, idx) => {
    return program.methods
      .setCurrentRewardsV0({
        currentRewards: new BN(x.currentRewards),
        oracleIndex: idx,
      })
      .accounts({
        lazyDistributor,
        recipient,
        oracle: x.oracleKey
      })
      .instruction();
  });
  const ixs = await Promise.all(ixPromises);
  let tx = new Transaction();
  tx.add(...ixs);

  const distributeIx = await program.methods
    .distributeRewardsV0()
    .accounts({ recipient, lazyDistributor, rewardsMint: lazyDistributorAcc.rewardsMint })
    .instruction();

  tx.recentBlockhash = (
    await provider.connection.getLatestBlockhash()
  ).blockhash;

  tx.feePayer = provider.wallet.publicKey

  tx.add(distributeIx);
  tx = await provider.wallet.signTransaction(tx);

  return tx;
}

export function setAndDistributeRewards() {
  console.log("hi");
}