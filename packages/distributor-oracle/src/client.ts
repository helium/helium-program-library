import {
  AnchorProvider,
  Program,
  BN,
} from "@project-serum/anchor";
import { TransactionInstruction, PublicKey, Transaction } from "@solana/web3.js";
import { LazyDistributor } from "@helium/idls/lib/types/lazy_distributor";
import axios from "axios";
import { recipientKey } from "@helium/lazy-distributor-sdk";
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
    // @ts-ignore
    lazyDistributorAcc.oracles.map((x: any) =>
      axios.get(`${x.url}?mint=${mint.toBase58()}`)
    )
  );
  return results.map((x: any, idx: number) => {
    return {
      currentRewards: x.data.currentRewards,
      // @ts-ignore
      oracleKey: lazyDistributorAcc.oracles[idx].oracle,
    };
  });
}

export async function formTransaction({
  program,
  provider,
  rewards,
  hotspot,
  lazyDistributor,
  wallet = provider.wallet.publicKey,
  skipOracleSign = false
}: {
  program: Program<LazyDistributor>,
  provider: AnchorProvider,
  rewards: Reward[],
  hotspot: PublicKey,
  lazyDistributor: PublicKey,
  wallet?: PublicKey,
  skipOracleSign?: boolean
}) {
  const recipient = recipientKey(lazyDistributor, hotspot)[0];
  const lazyDistributorAcc = (await program.account.lazyDistributorV0.fetch(lazyDistributor))!;
  const rewardsMint = lazyDistributorAcc.rewardsMint!;

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

  const recipientMintAccount = (await provider.connection.getTokenLargestAccounts(hotspot)).value[0].address;
  const hotspotAccount = await getAccount(provider.connection, recipientMintAccount);
  const destinationAccount = await getAssociatedTokenAddress(rewardsMint, hotspotAccount.owner, true);

  if (!await provider.connection.getAccountInfo(recipient)) {
    const initRecipientIx = await program.methods.initializeRecipientV0().accounts({
      lazyDistributor,
      mint: hotspot,
    }).instruction();
    
    tx.add(initRecipientIx);
  }
  tx.add(...ixs);

  const distributeIx = await program.methods
    .distributeRewardsV0()
    .accounts({
      recipient,
      lazyDistributor,
      rewardsMint,
      owner: hotspotAccount.owner,
      destinationAccount,
      recipientMintAccount
    })
    .instruction();
  
  tx.recentBlockhash = (
    await provider.connection.getLatestBlockhash()
  ).blockhash;

  tx.feePayer = wallet ? wallet : provider.wallet.publicKey;

  tx.add(distributeIx);
  // @ts-ignore
  const oracleUrls = lazyDistributorAcc.oracles.map((x: any) => x.url);

  let serTx = tx.serialize({ requireAllSignatures: false, verifySignatures: false })
  if (!skipOracleSign) {
    for (const oracle of oracleUrls) {
      const res = await axios.post(`${oracle}`, {
        transaction: serTx,
      });
      serTx = Buffer.from(res.data.transaction);
    }
  }
  
  const finalTx = Transaction.from(serTx);
  // Ensure the oracle didn't pull a fast one
  assertSameIxns(finalTx.instructions, tx.instructions);

  return finalTx;
}

function assertSameIxns(instructions: TransactionInstruction[], instructions1: TransactionInstruction[]) {
  if (instructions.length !== instructions1.length) {
    throw new Error("Extra instructions added by oracle");
  }

  instructions.forEach((instruction, idx) => {
    const instruction1 = instructions1[idx];
    if (instruction.programId.toBase58() !== instruction1.programId.toBase58()) {
      throw new Error("Program id mismatch");
    }
    if (!instruction.data.equals(instruction1.data)) {
      throw new Error("Instruction data mismatch");
    }

    if (instruction.keys.length !== instruction1.keys.length) {
      throw new Error("Key length mismatch");
    }

    instruction.keys.forEach((key, idx) => {
      const key1 = instruction1.keys[idx];
      if (key.pubkey.toBase58() !== key1.pubkey.toBase58()) {
        throw new Error("Key mismatch");
      }
    });
  })
}

