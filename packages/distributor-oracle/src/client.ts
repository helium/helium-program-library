import { AnchorProvider, Program } from "@project-serum/anchor";
import { PublicKey, Transaction } from "@solana/web3.js";
import { LazyDistributor } from "../../../target/types/lazy_distributor";
import axios from 'axios';
import { distributeRewardsInstructions, setCurrentRewardsInstructions } from "../../lazy-distributor-sdk/src";

export type Reward = {
  currentRewards: number,
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
  recipient: PublicKey) {
  const ixPromises = rewards.map((x) => {
    return setCurrentRewardsInstructions({
      program,
      provider,
      oracle: x.oracleKey,
      amount: x.currentRewards,
      recipient,
    })
  })
  const setRewardInstructions = await Promise.all(ixPromises);
  let tx = new Transaction();
  tx.add(...setRewardInstructions.map((x) => {
    return x.instructions[0]
  }));

  const distributeIx = await distributeRewardsInstructions({
    program,
    provider,
    recipient,
  })

  tx.recentBlockhash = (
    await provider.connection.getLatestBlockhash()
  ).blockhash;

  tx.feePayer = provider.wallet.publicKey

  tx.add(distributeIx.instructions[0]);
  tx = await provider.wallet.signTransaction(tx);
  return tx;
}

export function setAndDistributeRewards() {
  console.log("hi");
}