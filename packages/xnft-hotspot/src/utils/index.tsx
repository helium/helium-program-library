import * as client from "@helium/distributor-oracle";
import { LazyDistributor } from "@helium/idls/lib/types/lazy_distributor";
import {
  init,
  lazyDistributorKey,
} from "@helium/lazy-distributor-sdk";
import { recipientKey } from "@helium/lazy-distributor-sdk/src";
import { toNumber, MOBILE_MINT, truthy } from "@helium/spl-utils";
import { Program } from "@project-serum/anchor";
import { getMint } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { useEffect, useState } from "react";
import { useConnection, usePublicKey } from "react-xnft";
import { Recipient } from "../hooks/useRecipient";

export const LAZY_KEY = lazyDistributorKey(
  MOBILE_MINT
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
    init(window.xnft.solana).then((prog) => setProgram(prog)).catch(console.error);
  }, []);

  return program;
}

export async function getPendingRewards(
  program: Program<LazyDistributor>,
  mint: PublicKey,
  maybeRecipient: Recipient | undefined
) {
  // @ts-ignore
  const lazyDistributor = await program.account.lazyDistributorV0.fetch(
    LAZY_KEY
  );

  const oracleRewards = await client.getCurrentRewards(program, LAZY_KEY, mint);

  const rewardsMintAcc = await getMint(
    program.provider.connection,
    lazyDistributor.rewardsMint
  );

  const sortedOracleRewards = oracleRewards
    .map((rew) => rew.currentRewards)
    .sort((a, b) => new BN(a).sub(new BN(b)).toNumber());

  let oracleMedian = new BN(
    sortedOracleRewards[Math.floor(sortedOracleRewards.length / 2)]
  );


  const subbed = oracleMedian.sub(maybeRecipient?.totalRewards || new BN(0));

  return {
    pendingRewards: Math.max(toNumber(subbed, rewardsMintAcc.decimals), 0),
    rewardsMint: lazyDistributor.rewardsMint,
  };
}

async function fetchTokenAccounts(wallet: PublicKey): Promise<any> {
  //@ts-ignore
  const resp = await window.xnft.solana.connection.customSplTokenAccounts(
    wallet
  );
  const tokens = resp.tokenMetadata
    .map((m) => m?.account)
    .filter(truthy)
    .filter((t) => removeNullBytes(t.data.symbol) == "HOTSPOT");

    return tokens;
}

function removeNullBytes(str: string): string {
  return str
    .split("")
    .filter((char) => char.codePointAt(0))
    .join("");
}