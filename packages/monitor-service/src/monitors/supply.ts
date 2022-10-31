import { toNumber } from "@helium/spl-utils";
import {
  MintLayout
} from "@solana/spl-token";
import {
  PublicKey
} from "@solana/web3.js";
import { BN } from "bn.js";
import { supplyGauge } from "../metrics";
import { watch } from "./watch";

export function monitorSupply(mint: PublicKey, label: string) {
  watch(mint, (acc) => {
    const mint = MintLayout.decode(acc.data);
    supplyGauge.set(
      { name: label },
      toNumber(new BN(mint.supply.toString()), mint.decimals)
    );
  });
}
