import { toNumber } from "@helium/spl-utils";
import {
  AccountLayout,
  getAccount,
  getMint
} from "@solana/spl-token";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import { BN } from "bn.js";
import { balanceGauge } from "../metrics";
import { provider } from "../solana";
import { watch } from "./watch";

export async function monitorTokenBalance(account: PublicKey, label: string) {
  const acc = await getAccount(provider.connection, account);
  const mint = await getMint(provider.connection, acc.mint);
  watch(account, (raw) => {
    const account = AccountLayout.decode(raw!.data);
    balanceGauge.set(
      { name: label, type: "token" },
      toNumber(new BN(account.amount.toString()), mint.decimals)
    );
  });
}

export async function monitorSolBalance(account: PublicKey, label: string) {
  watch(account, (raw) => {
    balanceGauge.set(
      { name: label, type: "sol" },
      raw ? raw.lamports / LAMPORTS_PER_SOL : 0,
    );
  });
}
