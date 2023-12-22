import { toNumber } from "@helium/spl-utils";
import {
  AccountLayout,
  RawAccount,
  getAccount,
  getAssociatedTokenAddress,
  getMint,
} from "@solana/spl-token";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { BN } from "bn.js";
import { balanceGauge } from "../metrics";
import { provider } from "../solana";
import { watch } from "./watch";

export async function monitorTokenBalance(
  account: PublicKey,
  label: string,
  isMaker = false,
  extraFn: (acc: RawAccount) => void = () => {}
) {
  const acc = await getAccount(provider.connection, account);
  const mint = await getMint(provider.connection, acc.mint);
  watch(account, (raw) => {
    const rawAccount = AccountLayout.decode(raw!.data);
    balanceGauge.set(
      {
        name: label,
        address: account.toBase58(),
        type: "token",
        is_maker: `${isMaker}`,
      },
      toNumber(new BN(rawAccount.amount.toString()), mint.decimals)
    );
    extraFn(rawAccount);
  });
}

export async function monitiorAssociatedTokenBalance(
  account: PublicKey,
  mint: PublicKey,
  label: string,
  isMaker = false,
  type: string = "associated-token"
) {
  const associatedTokenAddress = await getAssociatedTokenAddress(
    mint,
    account,
    true
  );

  watch(associatedTokenAddress, async (raw) => {
    let amount: number = 0;

    try {
      const acc = await getAccount(provider.connection, associatedTokenAddress);
      const mintAcc = await getMint(provider.connection, acc.mint);
      const rawAccount = AccountLayout.decode(raw!.data);
      amount = toNumber(new BN(rawAccount.amount.toString()), mintAcc.decimals);
    } catch (_e) {
      // ata acc must not exist
      // set amount to default 0
    }

    balanceGauge.set(
      {
        name: label,
        address: account.toBase58(),
        type,
        is_maker: `${isMaker}`,
      },
      amount
    );
  });
}

export async function monitorSolBalance(
  account: PublicKey,
  label: string,
  isMaker = false
) {
  watch(account, (raw) => {
    balanceGauge.set(
      {
        name: label,
        address: account.toBase58(),
        type: "sol",
        is_maker: `${isMaker}`,
      },
      raw ? raw.lamports / LAMPORTS_PER_SOL : 0
    );
  });
}
