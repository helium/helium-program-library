import {
  accountWindowedBreakerKey,
  mintWindowedBreakerKey
} from "@helium/circuit-breaker-sdk";
import { CircuitBreaker } from "@helium/idls/lib/types/circuit_breaker";
import { toNumber } from "@helium/spl-utils";
import { Program } from "@coral-xyz/anchor";
import {
  getAccount,
  getMint,
  Mint
} from "@solana/spl-token";
import {
  PublicKey
} from "@solana/web3.js";
import { BN } from "bn.js";
import { circuitBreakerLevel, circuitBreakerLimitGauge } from "../metrics";
import { provider } from "../solana";
import { getUnixTimestamp, toPercent } from "./utils";
import { watch } from "./watch";


function setLimit(account: any, mint: Mint, balance: number, label: string) {
  let threshold: number;
  if (account.config.thresholdType.absolute) {
    threshold = toNumber(account.config.threshold, mint.decimals);
  } else {
    threshold = balance * toPercent(account.config.threshold, 5);
  }

  circuitBreakerLimitGauge.set({ name: label }, threshold);
}

async function setLevel(account: any, mint: Mint, label: string) {
  const lastValue = toNumber(
    account.lastWindow.lastAggregatedValue,
    mint.decimals
  );
  const clock = await getUnixTimestamp();
  const elapsed = Math.max(
    Number(clock) - account.lastWindow.lastUnixTimestamp.toNumber(),
    0
  );
  const discount =
    1 - Math.min(elapsed / account.config.windowSizeSeconds.toNumber(), 1);

  circuitBreakerLevel.set({ name: label }, discount * lastValue);
}

export async function monitorAccountCircuitBreaker(cbProgram: Program<CircuitBreaker>, account: PublicKey, label: string) {
  const tokenAccount = await getAccount(provider.connection, account);
  const mint = await getMint(provider.connection, tokenAccount.mint);
  const [cb] = await accountWindowedBreakerKey(account);
  watch(cb, async (acc) => {
    const cbAccount = cbProgram.coder.accounts.decode(
      "AccountWindowedCircuitBreakerV0",
      acc.data
    );
    const tokenAccount = await getAccount(provider.connection, account);

    setLimit(
      cbAccount,
      mint,
      toNumber(new BN(tokenAccount.amount.toString()), mint),
      label
    );
    await setLevel(cbAccount, mint, label);
  });
}

export async function monitorMintCircuitBreaker(
  cbProgram: Program<CircuitBreaker>,
  mint: PublicKey,
  label: string
) {
  const [cb] = await mintWindowedBreakerKey(mint);
  watch(cb, async (acc) => {
    const account = cbProgram.coder.accounts.decode(
      "MintWindowedCircuitBreakerV0",
      acc.data
    );
    const mintAcc = await getMint(provider.connection, mint);
    setLimit(
      account,
      mintAcc,
      toNumber(new BN(mintAcc.supply.toString()), mintAcc),
      label
    );
    setLevel(account, mintAcc, label);
  });
}
