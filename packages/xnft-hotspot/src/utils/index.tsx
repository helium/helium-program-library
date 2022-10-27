import * as client from "@helium-foundation/distributor-oracle";
import { LazyDistributor } from "@helium-foundation/idls/lib/types/lazy_distributor";
import {
  init,
  lazyDistributorKey,
} from "@helium-foundation/lazy-distributor-sdk";
import { recipientKey } from "@helium-foundation/lazy-distributor-sdk/src";
import { toNumber } from "@helium-foundation/spl-utils";
import { Program } from "@project-serum/anchor";
import { getMint } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { useEffect, useState } from "react";
import { useConnection, usePublicKey } from "react-xnft";

export const LAZY_KEY = lazyDistributorKey(
  new PublicKey("mob1r1x3raXXoH42RZwxTxgbAuKkBQzTAQqSjkUdZbd")
)[0];

export function useTokenAccounts() {
  const publicKey = usePublicKey();
  const connection = useConnection();

  const [tokenAccounts, setTokenAccounts] = useState<any[] | null>(null);
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
  }, []);

  return program;
}

export async function getPendingRewards(
  program: Program<LazyDistributor>,
  mint: PublicKey
) {
  const lazyDistributor = await program.account.lazyDistributorV0.fetch(
    LAZY_KEY
  );

  const [recipient] = recipientKey(LAZY_KEY, mint);
  const maybeRecipient = await program.account.recipientV0.fetchNullable(
    recipient
  );
  const oracleRewards = await client.getCurrentRewards(program, LAZY_KEY, mint);
  const rewardsMintAcc = await getMint(
    program.provider.connection,
    lazyDistributor.rewardsMint
  );
  const sortedRewards = (
    (maybeRecipient?.currentRewards as (BN | null)[]) || []
  ).sort((a, b) => (a || new BN(0)).sub(b || new BN(0)).toNumber());
  const sortedOracleRewards = oracleRewards
    .map((rew) => rew.currentRewards)
    .sort((a, b) => new BN(a).sub(new BN(b)).toNumber());

  let median = sortedRewards[Math.floor(sortedRewards.length / 2)];
  let oracleMedian = new BN(
    sortedOracleRewards[Math.floor(sortedOracleRewards.length / 2)]
  );
  if (!median) median = new BN(0);

  const subbed = oracleMedian.sub(median);
  return {
    pendingRewards: Math.max(toNumber(subbed, rewardsMintAcc.decimals), 0),
    rewardsMint: lazyDistributor.rewardsMint,
  };
}

async function fetchTokenAccounts(wallet: PublicKey): Promise<any> {
  //@ts-ignore
  const resp = await window.xnft.solana.connection.customSplTokenAccounts(wallet);
  const tokens = resp.nftMetadata.map((m) => m[1])
    .filter((t) => t.metadata.data.symbol == "HOTSPOT");
  return tokens;
}
