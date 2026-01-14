import * as anchor from "@coral-xyz/anchor";
import { init as cbInit } from "@helium/circuit-breaker-sdk";
import { accountPayerKey } from "@helium/data-credits-sdk";
import { init as hemInit } from "@helium/helium-entity-manager-sdk";
import {
  daoKey,
  init as hsdInit,
  subDaoKey,
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
import { register, totalRewardsGauge } from "./metrics";
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
import { monitorSupply } from "./monitors/supply";
import { monitorVehnt } from "./monitors/vehnt";
import { provider } from "./solana";

const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

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
  const hnt = await hsdProgram.account.daoV0.fetch(daoKey(HNT_MINT)[0]);
  const makers = await hemProgram.account.makerV0.all();

  const hntMint = dao.hntMint;
  const dcMint = dao.dcMint;
  const iotMint = iot.dntMint;
  const iotTreasury = iot.treasury;
  const iotRewardsEscrow = iot.rewardsEscrow;
  const hntRewardsEscrow = hnt.rewardsEscrow;
  const mobileMint = mobile.dntMint;
  const mobileTreasury = mobile.treasury;
  const mobileRewardsEscrow = mobile.rewardsEscrow;
  await Recipient.sync();
  await monitorVehnt();

  await monitorSupply(hntMint, "hnt");
  await monitorSupply(dcMint, "dc");
  await monitorSupply(iotMint, "iot");
  await monitorSupply(mobileMint, "mobile");
  await monitorMintCircuitBreaker(cbProgram, hntMint, "hnt_mint");
  await monitorMintCircuitBreaker(cbProgram, dcMint, "dc_mint");

  await monitorTokenBalance(iotTreasury, "iot_treasury");
  await monitorTokenBalance(mobileTreasury, "mobile_treasury");
  await setTotalRewards(IOT_MINT);
  await setTotalRewards(MOBILE_MINT);
  await setTotalRewards(HNT_MINT);

  const resetMobileTotal = debounce(() => setTotalRewards(MOBILE_MINT));
  const resetIotTotal = debounce(() => setTotalRewards(IOT_MINT));
  const resetHntTotal = debounce(() => setTotalRewards(HNT_MINT));
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
    getAssociatedTokenAddressSync(
      hntMint,
      lazyDistributorKey(hntMint)[0],
      true
    ),
    "hnt_rewards_escrow",
    false,
    async () => {
      resetHntTotal();
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
  await monitorSolBalance(
    new PublicKey(
      process.env.HPL_CRONS_QUEUE_AUTHORITY_KEY ||
        "2dbtp4u3axsLSXqgV6uhhsuTXEitveVdYu2GTdKgc1X8"
    ),
    "hpl_crons_queue_authority"
  );
  await monitorSolBalance(
    new PublicKey(
      process.env.DAO_KEY || "BQ3MCuTT5zVBhNfQ4SjMh3NPVhFy73MPV8rjfq5d1zie"
    ),
    "hnt_dao"
  );
  await monitorSolBalance(
    new PublicKey(
      process.env.HNT_REGISTRAR ||
        "BMnWRWZrWqb6JMKznaDqNxWaWAHoaTzVabM6Qwyh3WKz"
    ),
    "hnt_registrar"
  );

  const carrierAutoTopOff = new PublicKey(
    process.env.CARRIER_AUTO_TOPOFF_KEY ||
      "EsNPf1Beanrb96PmPqLD7V2RGhNrv4UV4nwJamF6ncr3"
  );
  await monitorSolBalance(carrierAutoTopOff, "carrier_auto_topoff");

  const mobileAutoTopOff = new PublicKey(
    process.env.HELIUM_MOBILE_AUTO_TOPOFF_KEY ||
      "Bvge1RMm2qfqsG4ijxv3ULNYzSosiaKuu8D2XPNpm2W6"
  );
  await monitorSolBalance(mobileAutoTopOff, "helium_mobile_auto_topoff");

  await monitorTokenBalance(
    getAssociatedTokenAddressSync(dao.hntMint, mobileAutoTopOff, true),
    "helium_mobile_auto_topoff_hnt"
  );

  await monitorTokenBalance(
    getAssociatedTokenAddressSync(dao.hntMint, carrierAutoTopOff, true),
    "carrier_auto_topoff_hnt"
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
      process.env.HPL_CRONS_QUEUE_KEY ||
        "H39gEszvsi6AT4rYBiJTuZHJSF5hMHy6CKGTd7wzhsg7"
    ),
    "hpl-crons-queue"
  );
  await monitorSolBalance(
    new PublicKey(
      process.env.CRON_KEY || "cronjz7v2xsWdXr8BVz38ihi5DTWPihGZKuRr6vSPEU"
    ),
    "cron"
  );
  await monitorSolBalance(
    new PublicKey(
      process.env.TUK_TUK_END_EPOCH_PAYER_KEY ||
        "HUkLp9NGFuVPtWkjdkuTPGnCtg87JTw2BcZxmUJy5w6L"
    ),
    "tuktuk-end-epoch-payer"
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
    "migration-service"
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
  await monitorAccountCircuitBreaker(
    cbProgram,
    hntRewardsEscrow,
    "hnt_rewards_escrow"
  );
  const delegatorPool = dao.delegatorPool;
  await monitorAccountCircuitBreaker(
    cbProgram,
    delegatorPool,
    "delegator_pool"
  );
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
