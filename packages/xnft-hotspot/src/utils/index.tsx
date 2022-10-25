import { useState, useEffect } from "react";
import ReactXnft, { usePublicKey, useConnection } from "react-xnft";
import { PublicKey } from "@solana/web3.js";
import { BN, Program } from "@project-serum/anchor";
import { init } from "@helium-foundation/lazy-distributor-sdk";
import { LazyDistributor } from "@helium-foundation/idls/lib/types/lazy_distributor";
import { getMint } from "@solana/spl-token";
import { toNumber } from "@helium-foundation/spl-utils";

export function useTokenAccounts() {
  const publicKey = usePublicKey();
  const connection = useConnection();

  const [tokenAccounts, setTokenAccounts] = useState<
    any[] | null
  >(null);
  useEffect(() => {
    (async () => {
      setTokenAccounts(null);
      const res = await fetchTokenAccounts(publicKey);
      setTokenAccounts(res);
    })();
  }, [publicKey, connection]);
  return tokenAccounts;
}

export function useProgram() {
  const [program, setProgram] = useState<Program<LazyDistributor> | null>(null);
  useEffect(() => {
    //@ts-ignore
    init(window.xnft.solana).then((prog) => setProgram(prog));
  }, [])

  return program;
}

export async function getPendingRewards(program: Program<LazyDistributor>, recipient: PublicKey) {
  const recipientAcc = await program.account.recipientV0.fetch(recipient);
  const lazyDistributor = await program.account.lazyDistributorV0.fetch(recipientAcc.lazyDistributor);
  const rewardsMintAcc = await getMint(program.provider.connection, lazyDistributor.rewardsMint);
  const sortedRewards = (recipientAcc.currentRewards as (BN | null)[]).sort((a, b) => (a || new BN(0)).sub((b || new BN(0))).toNumber());
  let median = sortedRewards[Math.floor(sortedRewards.length / 2)];
  if (!median) median = new BN(0);
  const subbed =  median.sub(recipientAcc.totalRewards);
  return {
    pendingRewards: Math.max(toNumber(subbed, rewardsMintAcc.decimals), 0),
    rewardsMint: lazyDistributor.rewardsMint,
  }
}

async function fetchTokenAccounts(
  wallet: PublicKey,
): Promise<any> {
  //@ts-ignore
  const resp = await window.xnft.solana.connection.customSplTokenAccounts(wallet);
  const tokens = resp.nftMetadata
    .map((m) => m[1])
    // TODO uncomment this filter with hotspot names
    // .filter((t) => t.tokenMetaUriData.name.startsWith("Hotspot"));
  return tokens;
}