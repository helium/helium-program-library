import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { VoterStakeRegistry } from "@helium/idls/lib/types/voter_stake_registry";
import {
  createAtaAndMint,
  createMint,
  sendInstructions,
  toBN
} from "@helium/spl-utils";
import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  getConcurrentMerkleTreeAccountSize
} from "@solana/spl-account-compression";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { BN } from "bn.js";
import { execSync } from "child_process";
import { ThresholdType } from "../../packages/circuit-breaker-sdk/src";
import { makerKey } from "../../packages/helium-entity-manager-sdk/src";
import { DataCredits } from "../../target/types/data_credits";
import { HeliumEntityManager } from "../../target/types/helium_entity_manager";
import { HeliumSubDaos } from "../../target/types/helium_sub_daos";
import { PriceOracle } from "../../target/types/price_oracle";
import { initTestDao, initTestSubdao } from "./daos";
import { exists, loadKeypair } from "./solana";
import { random } from "./string";

// TODO: replace this with helium default uri once uploaded
const DEFAULT_METADATA_URL =
  "https://c3zu2nc2m4x6zvqf5lofrtdbsa4niuh6drvzi7lq4n465ykbd3fa.arweave.net/FvNNNFpnL-zWBercWMxhkDjUUP4ca5R9cON57uFBHso/";

export const DC_FEE = 5000000;

export const initTestDataCredits = async (
  program: Program<DataCredits>,
  poProgram: Program<PriceOracle>,
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

  const hntOracleKp = loadKeypair(
    __dirname + "/../keypairs/hnt-oracle-test.json"
  );
  if (!(await exists(provider.connection, hntOracleKp.publicKey))) {
    await poProgram.methods.initializePriceOracleV0({
      oracles: [{
        authority: me,
        lastSubmittedPrice: null,
        lastSubmittedTimestamp: null,
      }],
      decimals: 8,
      authority: me
    }).accounts({
      priceOracle: hntOracleKp.publicKey,
      payer: me,
    }).signers([hntOracleKp])
    .rpc({skipPreflight: true});

    const price = new BN(100000000); // $1
    await poProgram.methods.submitPriceV0({
      oracleIndex: 0,
      price,
    }).accounts({
      priceOracle: hntOracleKp.publicKey,
    }).rpc({skipPreflight: true});
  }


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
        "horxeteuqLRK39UeaiVpgKUR565jStW2Edqd9ioShpU"
      ),
    });

  const dcKey = (await initDataCredits.pubkeys()).dataCredits!;

  await initDataCredits.rpc();

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
  const approve = await program.methods
    .approveMakerV0()
    .accounts({
      rewardableEntityConfig,
      maker,
    })
    .instruction();

  await sendInstructions(
    provider,
    [createMerkle, initialize, setTree, approve],
    [merkle, makerKeypair]
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

export async function ensureDCIdl(dcProgram: Program<DataCredits>) {
  try {
    execSync(
      `anchor idl init --filepath ${__dirname}/../../target/idl/data_credits.json ${dcProgram.programId}`,
      { stdio: "inherit", shell: "/bin/bash" }
    );
  } catch {
    execSync(
      `anchor idl upgrade --filepath ${__dirname}/../../target/idl/data_credits.json ${dcProgram.programId}`,
      { stdio: "inherit", shell: "/bin/bash" }
    );
  }
}

export async function ensureHSDIdl(hsdProgram: Program<HeliumSubDaos>) {
  try {
    execSync(
      `anchor idl init --filepath ${__dirname}/../../target/idl/helium_sub_daos.json ${hsdProgram.programId}`,
      { stdio: "inherit", shell: "/bin/bash" }
    );
  } catch {
    execSync(
      `anchor idl upgrade --filepath ${__dirname}/../../target/idl/helium_sub_daos.json ${hsdProgram.programId}`,
      { stdio: "inherit", shell: "/bin/bash" }
    );
  }
}

export async function ensureVSRIdl(vsrProgram: Program<VoterStakeRegistry>) {
  try {
    execSync(
      `anchor idl init --filepath ${__dirname}/../../target/idl/voter_stake_registry.json ${vsrProgram.programId}`,
      { stdio: "inherit", shell: "/bin/bash" }
    );
  } catch {
    execSync(
      `anchor idl upgrade --filepath ${__dirname}/../../target/idl/voter_stake_registry.json ${vsrProgram.programId}`,
      { stdio: "inherit", shell: "/bin/bash" }
    );
  }
}

export const initWorld = async (
  provider: anchor.AnchorProvider,
  hemProgram: Program<HeliumEntityManager>,
  hsdProgram: Program<HeliumSubDaos>,
  dcProgram: Program<DataCredits>,
  poProgram: Program<PriceOracle>,
  epochRewards?: number,
  subDaoEpochRewards?: number,
  registrar?: PublicKey,
  hntMint?: PublicKey,
  subDaoRegistrar?: PublicKey
): Promise<{
  dao: { mint: PublicKey; dao: PublicKey };
  subDao: {
    mint: PublicKey;
    subDao: PublicKey;
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
    poProgram,
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
  const subDao = await initTestSubdao(
    hsdProgram,
    provider,
    provider.wallet.publicKey,
    dao.dao,
    subDaoEpochRewards,
    subDaoRegistrar
  );

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
