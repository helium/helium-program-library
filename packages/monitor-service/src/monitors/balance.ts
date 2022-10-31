import { toNumber } from "@helium-foundation/spl-utils";
import {
  AccountLayout,
  getAccount,
  getMint
} from "@solana/spl-token";
import {
  PublicKey
} from "@solana/web3.js";
import { BN } from "bn.js";
import { balanceGauge } from "../metrics";
import { provider } from "../solana";
import { watch } from "./watch";

export async function monitorBalance(account: PublicKey, label: string) {
  const acc = await getAccount(provider.connection, account);
  const mint = await getMint(provider.connection, acc.mint);
  watch(account, (raw) => {
    const account = AccountLayout.decode(raw.data);
    balanceGauge.set(
      { name: label },
      toNumber(new BN(account.amount.toString()), mint.decimals)
    );
  });
}
