import {
  init as cbInit
} from "@helium/circuit-breaker-sdk";
import { daoKey, init as hsdInit, subDaoKey, threadKey } from "@helium/helium-sub-daos-sdk";
import { accountPayerKey } from "@helium/data-credits-sdk";
import { CircuitBreaker } from "@helium/idls/lib/types/circuit_breaker";
import { HeliumSubDaos } from "@helium/idls/lib/types/helium_sub_daos";
import * as anchor from "@coral-xyz/anchor";
import fastify from "fastify";
import { HNT_MINT, MOBILE_MINT, IOT_MINT } from "./env";
import { register } from "./metrics";
import { monitorSolBalance, monitorTokenBalance } from "./monitors/balance";
import { monitorAccountCircuitBreaker, monitorMintCircuitBreaker } from "./monitors/circuitBreaker";
import { monitorSupply } from "./monitors/supply";
import { provider } from "./solana";
import { Cluster, PublicKey } from "@solana/web3.js";
import {
  SwitchboardProgram,
  AggregatorAccount,
  READ_ONLY_KEYPAIR,
} from "@switchboard-xyz/solana.js";

let hsdProgram: anchor.Program<HeliumSubDaos>;
let cbProgram: anchor.Program<CircuitBreaker>;

const server = fastify();
server.get("/metrics", async (request, reply) => {
  return register.metrics()
});

async function run() {
  hsdProgram = await hsdInit(provider);
  cbProgram = await cbInit(provider);

  const daoPk = daoKey(HNT_MINT)[0];
  const dao = await hsdProgram.account.daoV0.fetch(daoPk);
  const mobileKey = subDaoKey(MOBILE_MINT)[0];
  const iotKey = subDaoKey(IOT_MINT)[0];
  const mobile = await hsdProgram.account.subDaoV0.fetch(mobileKey);
  const iot = await hsdProgram.account.subDaoV0.fetch(iotKey);

  const hntMint = dao.hntMint;
  const dcMint = dao.dcMint;
  const iotMint = iot.dntMint;
  const iotTreasury = iot.treasury;
  const iotRewardsEscrow = iot.rewardsEscrow;
  const mobileMint = mobile.dntMint;
  const mobileTreasury = mobile.treasury;
  const mobileRewardsEscrow = mobile.rewardsEscrow;

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
  await monitorTokenBalance(iotRewardsEscrow, "iot_rewards_escrow");
  await monitorTokenBalance(mobileRewardsEscrow, "mobile_rewards_escrow");

  await monitorSolBalance(threadKey(mobileKey, "calculate")[0], "clockwork_thread_mobile_calculate");
  await monitorSolBalance(threadKey(mobileKey, "issue")[0], "clockwork_thread_mobile_issue");
  await monitorSolBalance(threadKey(iotKey, "calculate")[0], "clockwork_thread_iot_calculate");
  await monitorSolBalance(threadKey(iotKey, "issue")[0], "clockwork_thread_iot_issue");
  await monitorSolBalance(threadKey(daoPk, "issue_hst")[0], "clockwork_thread_dao_issue_hst");
  await monitorSolBalance(accountPayerKey()[0], "data_credits_account_payer");

  const ep = provider.connection.rpcEndpoint;
  const isLocalhost = ep.includes("127.0.0.1") || ep.includes("localhost");
  if (!isLocalhost) {
    try {
      const cluster = provider.connection.rpcEndpoint.includes("devnet") ? "devnet" : "mainnet-beta";
      const pid = cluster == "devnet" ? "2TfB33aLaneQb5TNVwyDz3jSZXS6jdW2ARw1Dgf84XCG" : "SW1TCH7qEPTdLsDHRgPuMQjbQxKdH2aBStViMFnt64f"
      const switchboard = await SwitchboardProgram.load(
        cluster as Cluster,
        provider.connection,
        READ_ONLY_KEYPAIR,
        new PublicKey(pid),
      );
      const mobileAgg = await AggregatorAccount.load(switchboard, mobile.activeDeviceAggregator);
      const [mobileLease] = anchor.utils.publicKey.findProgramAddressSync(
        [Buffer.from('LeaseAccountData'), mobileAgg[1].queuePubkey.toBytes(), mobileAgg[0].publicKey.toBytes()],
        switchboard.programId
      );
      const iotAgg = await AggregatorAccount.load(switchboard, iot.activeDeviceAggregator);
      const [iotLease] = anchor.utils.publicKey.findProgramAddressSync(
        [Buffer.from('LeaseAccountData'), iotAgg[1].queuePubkey.toBytes(), iotAgg[0].publicKey.toBytes()],
        switchboard.programId
      );
  
      await monitorSolBalance(mobileLease, "switchboard_mobile_lease_account")
      await monitorSolBalance(iotLease, "switchboard_iot_lease_account")
    } catch (err) {
      console.error(err);
    }
    
  }

  await monitorAccountCircuitBreaker(
    cbProgram,
    mobileTreasury,
    "mobile_treasury"
  );
  await monitorAccountCircuitBreaker(
    cbProgram,
    iotTreasury,
    "iot_treasury"
  );
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
