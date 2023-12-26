import * as anchor from "@coral-xyz/anchor";
import { init as cbInit } from "@helium/circuit-breaker-sdk";
import { accountPayerKey } from "@helium/data-credits-sdk";
import {
  init as hemInit
} from "@helium/helium-entity-manager-sdk";
import {
  daoKey,
  init as hsdInit,
  subDaoKey
} from "@helium/helium-sub-daos-sdk";
import { CircuitBreaker } from "@helium/idls/lib/types/circuit_breaker";
import { HeliumEntityManager } from "@helium/idls/lib/types/helium_entity_manager";
import { HeliumSubDaos } from "@helium/idls/lib/types/helium_sub_daos";
import { PriceOracle } from "@helium/idls/lib/types/price_oracle";
import { lazyDistributorKey } from "@helium/lazy-distributor-sdk";
import { lazySignerKey } from "@helium/lazy-transactions-sdk";
import { init as poInit } from "@helium/price-oracle-sdk";
import { toNumber } from "@helium/spl-utils";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { BN } from "bn.js";
import fastify from "fastify";
import { underscore } from "inflection";
import { HNT_MINT, IOT_MINT, MOBILE_MINT } from "./env";
import {
  register,
  totalRewardsGauge
} from "./metrics";
import { Recipient, sequelize } from "./model";
import {
  monitiorAssociatedTokenBalance,
  monitorSolBalance,
  monitorTokenBalance,
} from "./monitors/balance";
import {
  monitorAccountCircuitBreaker,
  monitorMintCircuitBreaker,
} from "./monitors/circuitBreaker";
import { monitorPriceOracle } from "./monitors/priceOracle";
import { monitorSupply } from "./monitors/supply";
import { monitorVehnt } from "./monitors/vehnt";
import { provider } from "./solana";

let hemProgram: anchor.Program<HeliumEntityManager>;
let hsdProgram: anchor.Program<HeliumSubDaos>;
let cbProgram: anchor.Program<CircuitBreaker>;
let poProgram: anchor.Program<PriceOracle>;

const server = fastify();
server.get("/metrics", async (request, reply) => {
  return register.metrics();
});

function debounce(func: any, wait: number = 10000) {
  let timeout: any;
  return function executedFunction(...args: any[]) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

async function setTotalRewards(mint: PublicKey) {
  const lazyDistributor = lazyDistributorKey(mint)[0].toBase58();
  const sum = (
    await Recipient.findAll({
      where: {
        lazyDistributor,
      },
      attributes: [
        [sequelize.fn("SUM", sequelize.col("total_rewards")), "totalRewards"],
      ],
    })
  )[0].totalRewards;
  const sumActual = toNumber(new BN(sum), 6);
  totalRewardsGauge.labels(mint.toBase58()).set(sumActual);
}

async function run() {
  hemProgram = await hemInit(provider);
  hsdProgram = await hsdInit(provider);
  cbProgram = await cbInit(provider);
  poProgram = await poInit(provider);

  const daoPk = daoKey(HNT_MINT)[0];
  const dao = await hsdProgram.account.daoV0.fetch(daoPk);
  const mobileKey = subDaoKey(MOBILE_MINT)[0];
  const iotKey = subDaoKey(IOT_MINT)[0];

  server.listen({ port: 8082, host: "0.0.0.0" }, (err, address) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`Server listening at ${address}`);
  });

  const mobile = await hsdProgram.account.subDaoV0.fetch(mobileKey);
  const iot = await hsdProgram.account.subDaoV0.fetch(iotKey);
  const makers = await hemProgram.account.makerV0.all();

  const hntMint = dao.hntMint;
  const dcMint = dao.dcMint;
  const iotMint = iot.dntMint;
  const iotTreasury = iot.treasury;
  const iotRewardsEscrow = iot.rewardsEscrow;
  const mobileMint = mobile.dntMint;
  const mobileTreasury = mobile.treasury;
  const mobileRewardsEscrow = mobile.rewardsEscrow;

  await monitorPriceOracle(poProgram);

  await Recipient.sync();
  await monitorVehnt();

  await monitorSupply(hntMint, "hnt");
  await monitorSupply(dcMint, "dc");
  await monitorSupply(iotMint, "iot");
  await monitorSupply(mobileMint, "mobile");
  await monitorMintCircuitBreaker(cbProgram, hntMint, "hnt_mint");
  await monitorMintCircuitBreaker(cbProgram, dcMint, "dc_mint");
  await monitorMintCircuitBreaker(cbProgram, iotMint, "iot_mint");
  await monitorMintCircuitBreaker(cbProgram, mobileMint, "mobile_mint");

  await monitorTokenBalance(iotTreasury, "iot_treasury");
  await monitorTokenBalance(mobileTreasury, "mobile_treasury");
  await setTotalRewards(IOT_MINT);
  await setTotalRewards(MOBILE_MINT);
  const resetMobileTotal = debounce(() => setTotalRewards(MOBILE_MINT));
  const resetIotTotal = debounce(() => setTotalRewards(IOT_MINT));
  await monitorTokenBalance(
    iotRewardsEscrow,
    "iot_rewards_escrow",
    false,
    async () => {
      resetIotTotal();
    }
  );
  await monitorTokenBalance(
    mobileRewardsEscrow,
    "mobile_rewards_escrow",
    false,
    async () => {
      resetMobileTotal();
    }
  );
  await monitorTokenBalance(
    getAssociatedTokenAddressSync(dao.dcMint, iot.activeDeviceAuthority),
    "iot_active_device_oracle_dc"
  );
  await monitorTokenBalance(
    getAssociatedTokenAddressSync(dao.dcMint, mobile.activeDeviceAuthority),
    "mobile_active_device_oracle_dc"
  );
  await monitorSolBalance(
    iot.activeDeviceAuthority,
    "iot_active_device_oracle_sol"
  );
  await monitorSolBalance(
    mobile.activeDeviceAuthority,
    "mobile_active_device_oracle_sol"
  );

  for (const maker of makers) {
    await monitorSolBalance(
      maker.account.issuingAuthority,
      underscore(maker.account.name),
      true
    );

    await monitiorAssociatedTokenBalance(
      maker.account.issuingAuthority,
      dcMint,
      underscore(maker.account.name),
      true,
      "data-credits"
    );
  }

  await monitorSolBalance(
    new PublicKey(
      process.env.CRON_KEY || "cronjz7v2xsWdXr8BVz38ihi5DTWPihGZKuRr6vSPEU"
    ),
    "cron"
  );
  await monitorSolBalance(
    new PublicKey(
      process.env.ORACLE_KEY || "orc1TYY5L4B4ZWDEMayTqu99ikPM9bQo9fqzoaCPP5Q"
    ),
    "oracle"
  );
  await monitorSolBalance(
    new PublicKey(
      process.env.MIGRATION_KEY || "mgrArTL62g582wWV6iM4fwU1LKnbUikDN6akKJ76pzK"
    ),
    "oracle"
  );
  await monitorSolBalance(
    lazySignerKey(process.env.LAZY_SIGNER || "nJWGUMOK")[0],
    "lazy_signer"
  );

  await monitorSolBalance(mobile.dcBurnAuthority, "mobile_dc_burn_authority");

  await monitorSolBalance(iot.dcBurnAuthority, "iot_dc_burn_authority");

  await monitorSolBalance(accountPayerKey()[0], "data_credits_account_payer");

  const ep = provider.connection.rpcEndpoint;
  const isLocalhost = ep.includes("127.0.0.1") || ep.includes("localhost");

  await monitorAccountCircuitBreaker(
    cbProgram,
    mobileTreasury,
    "mobile_treasury"
  );
  await monitorAccountCircuitBreaker(cbProgram, iotTreasury, "iot_treasury");
  await monitorAccountCircuitBreaker(
    cbProgram,
    iotRewardsEscrow,
    "iot_rewards_escrow"
  );
  await monitorAccountCircuitBreaker(
    cbProgram,
    mobileRewardsEscrow,
    "mobile_rewards_escrow"
  );
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
