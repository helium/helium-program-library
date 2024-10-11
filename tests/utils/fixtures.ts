import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { MobileEntityManager } from "@helium/idls/lib/types/mobile_entity_manager";
import { VoterStakeRegistry } from "@helium/idls/lib/types/voter_stake_registry";
import {
  createAtaAndMint,
  createAtaAndTransfer,
  createMint,
  sendMultipleInstructions,
  toBN
} from "@helium/spl-utils";
import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  getConcurrentMerkleTreeAccountSize,
} from "@solana/spl-account-compression";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { execSync } from "child_process";
import { ThresholdType } from "../../packages/circuit-breaker-sdk/src";
import { makerKey } from "../../packages/helium-entity-manager-sdk/src";
import { DataCredits } from "../../target/types/data_credits";
import { HeliumEntityManager } from "../../target/types/helium_entity_manager";
import { HeliumSubDaos } from "../../target/types/helium_sub_daos";
import { LazyDistributor } from "../../target/types/lazy_distributor";
import { initTestDao, initTestSubdao } from "./daos";
import { random } from "./string";
import { PositionVotingRewards } from "../../target/types/position_voting_rewards";

// TODO: replace this with helium default uri once uploaded
const DEFAULT_METADATA_URL =
  "https://c3zu2nc2m4x6zvqf5lofrtdbsa4niuh6drvzi7lq4n465ykbd3fa.arweave.net/FvNNNFpnL-zWBercWMxhkDjUUP4ca5R9cON57uFBHso/";

export const DC_FEE = 5000000;
export const MAKER_STAKING_FEE = toBN(10, 6);

export const initTestDataCredits = async (
  program: Program<DataCredits>,
  provider: anchor.AnchorProvider,
  startingHntbal?: number,
  hntMint?: PublicKey
): Promise<{
  dcKey: PublicKey;
  hntMint: PublicKey;
  dcMint: PublicKey;
  hntBal: number;
  dcBal: number;
}> => {
  if (!startingHntbal) {
    startingHntbal = 10000000000;
  }
  const me = provider.wallet.publicKey;
  let hntBal = startingHntbal;
  let dcMint;
  let dcBal = 0;

  if (!hntMint) {
    hntMint = await createMint(provider, 8, me, me);
  }
  dcMint = await createMint(provider, 0, me, me);

  await createAtaAndMint(provider, hntMint, toBN(startingHntbal, 8), me);

  const initDataCredits = await program.methods
    .initializeDataCreditsV0({
      authority: me,
      config: {
        windowSizeSeconds: new anchor.BN(60),
        thresholdType: ThresholdType.Absolute as never,
        threshold: new anchor.BN("10000000000000000000"),
      },
    })
    .accounts({
      hntMint,
      dcMint,
      hntPriceOracle: new PublicKey(
        "4DdmDswskDxXGpwHrXUfn2CNUm9rt21ac79GHNTN3J33"
      ),
    });

  const dcKey = (await initDataCredits.pubkeys()).dataCredits!;

  await initDataCredits.rpc({ skipPreflight: true });

  return { dcKey, hntMint, hntBal, dcMint, dcBal };
};

export const initTestRewardableEntityConfig = async (
  program: Program<HeliumEntityManager>,
  subDao: PublicKey,
  settings: any = {
    iotConfig: {
      minGain: 10,
      maxGain: 150,
      fullLocationStakingFee: toBN(1000000, 0),
      dataonlyLocationStakingFee: toBN(500000, 0),
    } as any,
  }
): Promise<{
  rewardableEntityConfig: PublicKey;
}> => {
  const method = await program.methods
    .initializeRewardableEntityConfigV0({
      symbol: random(), // symbol is unique would need to restart localnet everytime
      settings,
      // Require 10 staked tokens
      stakingRequirement: MAKER_STAKING_FEE,
    })
    .accounts({
      subDao,
    });

  const { rewardableEntityConfig } = await method.pubkeys();
  await method.rpc({ skipPreflight: true });

  return {
    rewardableEntityConfig: rewardableEntityConfig!,
  };
};

export const initTestMaker = async (
  program: Program<HeliumEntityManager>,
  provider: anchor.AnchorProvider,
  rewardableEntityConfig: PublicKey,
  dao: PublicKey
): Promise<{
  authority: PublicKey;
  makerKeypair: Keypair;
  collection: PublicKey;
  maker: PublicKey;
  merkle: PublicKey;
  treeAuthority: PublicKey;
}> => {
  const makerKeypair = Keypair.generate();
  const merkle = Keypair.generate();
  // Testing -- small tree
  const space = getConcurrentMerkleTreeAccountSize(3, 8);
  const name = random(10);

  const maker = makerKey(dao, name)[0];
  const createMerkle = SystemProgram.createAccount({
    fromPubkey: provider.wallet.publicKey,
    newAccountPubkey: merkle.publicKey,
    lamports: await provider.connection.getMinimumBalanceForRentExemption(
      space
    ),
    space: space,
    programId: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  });
  const {
    pubkeys: { collection },
    instruction: initialize,
  } = await program.methods
    .initializeMakerV0({
      updateAuthority: makerKeypair.publicKey,
      issuingAuthority: makerKeypair.publicKey,
      name,
      metadataUrl: DEFAULT_METADATA_URL,
    })
    .accounts({
      dao,
    })
    .prepare();
  const {
    pubkeys: { treeAuthority },
    instruction: setTree,
  } = await program.methods
    .setMakerTreeV0({
      maxDepth: 3,
      maxBufferSize: 8,
    })
    .accounts({
      maker,
      merkleTree: merkle.publicKey,
      updateAuthority: makerKeypair.publicKey,
    })
    .prepare();

  const rewConfig = await program.account.rewardableEntityConfigV0.fetch(
    rewardableEntityConfig
  );
  const {
    instruction: approve,
    pubkeys: { dntMint },
  } = await program.methods
    .approveMakerV0()
    .accounts({
      rewardableEntityConfig,
      maker,
    })
    .prepare();
  await createAtaAndTransfer(
    provider,
    dntMint!,
    rewConfig.stakingRequirement,
    provider.wallet.publicKey,
    maker
  );

  await sendMultipleInstructions(
    provider,
    [
      [createMerkle, initialize],
      [setTree, approve],
    ],
    [[merkle], [makerKeypair]]
  );

  return {
    maker: maker!,
    makerKeypair,
    collection: collection!,
    authority: makerKeypair.publicKey,
    merkle: merkle.publicKey,
    treeAuthority: treeAuthority!,
  };
};

const ANCHOR_PATH = process.env.ANCHOR_PATH || "anchor";

export async function ensureDCIdl(dcProgram: Program<DataCredits>) {
  try {
    execSync(
      `${ANCHOR_PATH} idl init --filepath ${__dirname}/../../target/idl/data_credits.json ${dcProgram.programId}`,
      { stdio: "inherit", shell: "/bin/bash" }
    );
  } catch {
    execSync(
      `${ANCHOR_PATH} idl upgrade --filepath ${__dirname}/../../target/idl/data_credits.json ${dcProgram.programId}`,
      { stdio: "inherit", shell: "/bin/bash" }
    );
  }
}

export async function ensurePVRIdl(pvrProgram: Program<PositionVotingRewards>) {
  try {
    execSync(
      `${ANCHOR_PATH} idl init --filepath ${__dirname}/../../target/idl/position_voting_rewards.json ${pvrProgram.programId}`,
      { stdio: "inherit", shell: "/bin/bash" }
    );
  } catch {
    execSync(
      `${ANCHOR_PATH} idl upgrade --filepath ${__dirname}/../../target/idl/position_voting_rewards.json ${pvrProgram.programId}`,
      { stdio: "inherit", shell: "/bin/bash" }
    );
  }
}

export async function ensureMemIdl(memProgram: Program<MobileEntityManager>) {
  try {
    execSync(
      `${ANCHOR_PATH} idl init --filepath ${__dirname}/../../target/idl/mobile_entity_manager.json ${memProgram.programId}`,
      { stdio: "inherit", shell: "/bin/bash" }
    );
  } catch {
    execSync(
      `${ANCHOR_PATH} idl upgrade --filepath ${__dirname}/../../target/idl/mobile_entity_manager.json ${memProgram.programId}`,
      { stdio: "inherit", shell: "/bin/bash" }
    );
  }
}

export async function ensureLDIdl(ldProgram: Program<LazyDistributor>) {
  try {
    execSync(
      `${ANCHOR_PATH} idl init --filepath ${__dirname}/../../target/idl/lazy_distributor.json ${ldProgram.programId}`,
      { stdio: "inherit", shell: "/bin/bash" }
    );
  } catch {
    execSync(
      `${ANCHOR_PATH} idl upgrade --filepath ${__dirname}/../../target/idl/lazy_distributor.json ${ldProgram.programId}`,
      { stdio: "inherit", shell: "/bin/bash" }
    );
  }
}

export async function ensureHEMIdl(hemProgram: Program<HeliumEntityManager>) {
  try {
    execSync(
      `${ANCHOR_PATH} idl init --filepath ${__dirname}/../../target/idl/helium_entity_manager.json ${hemProgram.programId}`,
      { stdio: "inherit", shell: "/bin/bash" }
    );
  } catch {
    execSync(
      `${ANCHOR_PATH} idl upgrade --filepath ${__dirname}/../../target/idl/helium_entity_manager.json ${hemProgram.programId}`,
      { stdio: "inherit", shell: "/bin/bash" }
    );
  }
}

export async function ensureHSDIdl(hsdProgram: Program<HeliumSubDaos>) {
  try {
    execSync(
      `${ANCHOR_PATH} idl init --filepath ${__dirname}/../../target/idl/helium_sub_daos.json ${hsdProgram.programId}`,
      { stdio: "inherit", shell: "/bin/bash" }
    );
  } catch {
    execSync(
      `${ANCHOR_PATH} idl upgrade --filepath ${__dirname}/../../target/idl/helium_sub_daos.json ${hsdProgram.programId}`,
      { stdio: "inherit", shell: "/bin/bash" }
    );
  }
}

export async function ensureVSRIdl(vsrProgram: Program<VoterStakeRegistry>) {
  try {
    execSync(
      `${ANCHOR_PATH} idl init --filepath ${__dirname}/../../target/idl/voter_stake_registry.json ${vsrProgram.programId}`,
      { stdio: "inherit", shell: "/bin/bash" }
    );
  } catch {
    execSync(
      `${ANCHOR_PATH} idl upgrade --filepath ${__dirname}/../../target/idl/voter_stake_registry.json ${vsrProgram.programId}`,
      { stdio: "inherit", shell: "/bin/bash" }
    );
  }
}

export const initWorld = async (
  provider: anchor.AnchorProvider,
  hemProgram: Program<HeliumEntityManager>,
  hsdProgram: Program<HeliumSubDaos>,
  dcProgram: Program<DataCredits>,
  vsrProgram: Program<VoterStakeRegistry>,
  epochRewards?: number,
  subDaoEpochRewards?: number,
  registrar?: PublicKey,
  hntMint?: PublicKey,
): Promise<{
  dao: { mint: PublicKey; dao: PublicKey };
  subDao: {
    mint: PublicKey;
    subDao: PublicKey;
    subDaoRegistrar: PublicKey;
    treasury: PublicKey;
    rewardsEscrow: PublicKey;
    delegatorPool: PublicKey;
  };
  dataCredits: {
    dcKey: PublicKey;
    hntMint: PublicKey;
    hntBal: number;
    dcMint: PublicKey;
    dcBal: number;
  };
  rewardableEntityConfig: {
    rewardableEntityConfig: PublicKey;
  };
  maker: {
    maker: PublicKey;
    collection: PublicKey;
    authority: PublicKey;
    makerKeypair: Keypair;
    merkle: PublicKey;
    treeAuthority: PublicKey;
  };
}> => {
  const dataCredits = await initTestDataCredits(
    dcProgram,
    provider,
    undefined,
    hntMint
  );

  const dao = await initTestDao(
    hsdProgram,
    provider,
    epochRewards || 50,
    provider.wallet.publicKey,
    dataCredits.dcMint,
    dataCredits.hntMint,
    registrar
  );
  const subDao = await initTestSubdao({
    hsdProgram,
    vsrProgram,
    provider,
    authority: provider.wallet.publicKey,
    dao: dao.dao,
    epochRewards: subDaoEpochRewards,
    // Enough to stake 4 makers
    numTokens: MAKER_STAKING_FEE.mul(new anchor.BN(4))
  });

  const rewardableEntityConfig = await initTestRewardableEntityConfig(
    hemProgram,
    subDao.subDao
  );

  const maker = await initTestMaker(
    hemProgram,
    provider,
    rewardableEntityConfig.rewardableEntityConfig,
    dao.dao
  );

  return {
    dao,
    subDao,
    dataCredits,
    rewardableEntityConfig,
    maker,
  };
};
