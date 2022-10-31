import {
  init as cbInit
} from "@helium/circuit-breaker-sdk";
import { daoKey, init as hsdInit, subDaoKey } from "@helium/helium-sub-daos-sdk";
import { CircuitBreaker } from "@helium/idls/lib/types/circuit_breaker";
import { HeliumSubDaos } from "@helium/idls/lib/types/helium_sub_daos";
import * as anchor from "@project-serum/anchor";
import fastify from "fastify";
import { HNT_MINT, MOBILE_MINT } from "./env";
import { register } from "./metrics";
import { monitorBalance } from "./monitors/balance";
import { monitorAccountCircuitBreaker, monitorMintCircuitBreaker } from "./monitors/circuitBreaker";
import { monitorSupply } from "./monitors/supply";
import { provider } from "./solana";

let hsdProgram: anchor.Program<HeliumSubDaos>;
let cbProgram: anchor.Program<CircuitBreaker>;

const server = fastify();
server.get("/metrics", async (request, reply) => {
  return register.metrics()
});

async function run() {
  hsdProgram = await hsdInit(provider);
  cbProgram = await cbInit(provider);

  const dao = await hsdProgram.account.daoV0.fetch((await daoKey(HNT_MINT))[0]);
  const mobile = await hsdProgram.account.subDaoV0.fetch(
    (
      await subDaoKey(MOBILE_MINT)
    )[0]
  );
  const hntMint = dao.hntMint;
  const dcMint = dao.dcMint;
  const mobileMint = mobile.dntMint;
  const mobileTreasury = mobile.treasury;
  const mobileRewardsEscrow = mobile.rewardsEscrow;

  await monitorSupply(hntMint, "hnt");
  await monitorSupply(dcMint, "dc");
  await monitorSupply(mobileMint, "mobile");
  await monitorMintCircuitBreaker(cbProgram, hntMint, "hnt_mint");
  await monitorMintCircuitBreaker(cbProgram, dcMint, "dc_mint");
  await monitorMintCircuitBreaker(cbProgram, mobileMint, "mobile_mint");

  await monitorBalance(mobileTreasury, "mobile_treasury");
  await monitorBalance(mobileRewardsEscrow, "mobile_rewards_escrow");

  await monitorAccountCircuitBreaker(
    cbProgram,
    mobileTreasury,
    "mobile_treasury"
  );
  await monitorAccountCircuitBreaker(
    cbProgram,
    mobileRewardsEscrow,
    "mobile_rewards_escrow"
  );

  server.listen({ port: 8082, host: "0.0.0.0" }, (err, address) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`Server listening at ${address}`);
  });
}

run().catch(e => {
  console.error(e);
  process.exit(1)
});
