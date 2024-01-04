import * as anchor from "@coral-xyz/anchor";
import { watch } from "./watch";
import { PublicKey } from "@solana/web3.js";
import { PriceOracle } from "@helium/idls/lib/types/price_oracle";
import { oraclePrice, oracleTimeSinceSubmitted } from "../metrics";
import { monitorSolBalance } from "./balance";

const PRICE_ORACLES = [
  {
    name: "iot",
    key: new PublicKey("iortGU2NMgWc256XDBz2mQnmjPfKUMezJ4BWfayEZY3"),
  },
  {
    name: "mobile",
    key: new PublicKey("iortGU2NMgWc256XDBz2mQnmjPfKUMezJ4BWfayEZY3"),
  },
];

type PriceOracleV0 = anchor.IdlAccounts<PriceOracle>["priceOracleV0"];

export async function monitorPriceOracle(
  poProgram: anchor.Program<PriceOracle>
) {
  for (const { name, key } of PRICE_ORACLES) {
    const priceOracle = await poProgram.account.priceOracleV0.fetch(key);
    watch(key, (raw) => {
      if (raw) {
        const { oracles } = poProgram.coder.accounts.decode<PriceOracleV0>(
          "PriceOracleV0",
          raw.data
        );
        oracles.map((oracle) => {
          oraclePrice
            .labels({
              oracle: name,
              wallet: oracle.authority.toBase58(),
            })
            .set(oracle.lastSubmittedPrice?.toNumber() || 0);
          oracleTimeSinceSubmitted
            .labels({
              oracle: name,
              wallet: oracle.authority.toBase58(),
            })
            .set(
              new Date().valueOf() / 1000 -
                (oracle.lastSubmittedTimestamp?.toNumber() || 0)
            );
        });
      }
    });

    priceOracle.oracles.map((oracle) => {
      monitorSolBalance(oracle.authority, name + "_price_oracle");
    });
  }
}
