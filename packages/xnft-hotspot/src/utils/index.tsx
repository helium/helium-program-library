import * as client from "@helium/distributor-oracle";
import { LazyDistributor } from "@helium/idls/lib/types/lazy_distributor";
import {
  init,
  lazyDistributorKey
} from "@helium/lazy-distributor-sdk";
import {
  Asset, AssetsByOwnerOpts, getAssetsByOwner, MOBILE_MINT, toNumber, truthy
} from "@helium/spl-utils";
import { Program } from "@project-serum/anchor";
import { getMint } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { useEffect, useMemo, useState } from "react";
import { useAsync, UseAsyncReturn } from "react-async-hook";
import { useConnection, usePublicKey } from "react-xnft";
import { Recipient } from "../hooks/useRecipient";

export const LAZY_KEY = lazyDistributorKey(
  MOBILE_MINT
)[0];

function getRpc(connection: Connection): string {
  // @ts-ignore
  const endpoint = connection._rpcEndpoint

  if (endpoint.includes("devnet")) {
    return "https://rpc-devnet.aws.metaplex.com";
  }

  return endpoint
}


export function useAssets(
  wallet: PublicKey,
  opts: AssetsByOwnerOpts
): UseAsyncReturn<Asset[]> {
  const connection = useConnection();
  const rpc = useMemo(() => getRpc(connection), [connection]);
  const stableOpts = useMemo(() => opts, [JSON.stringify(opts)])
  return useAsync(getAssetsByOwner, [rpc, wallet.toBase58(), stableOpts]);
}

export function useRewardableNfts(): UseAsyncReturn<Asset[]> {
  const publicKey = usePublicKey();
  const { result, ...rest } = useAssets(publicKey, { limit: 10000 });

  return {
    result: result?.filter(
      (nft) =>
        nft.content.metadata.attributes
          ?.find((att) => att.trait_name == "rewardable")
          ?.value?.toString() == "true"
    ),
    ...rest,
  };
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

    console.log("tokens", tokens);

    return tokens;
}

function removeNullBytes(str: string): string {
  return str
    .split("")
    .filter((char) => char.codePointAt(0))
    .join("");
}