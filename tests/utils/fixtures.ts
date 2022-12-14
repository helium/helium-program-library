import { HNT_PYTH_PRICE_FEED, toBN } from "@helium/spl-utils";
import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { SystemProgram, Keypair, PublicKey } from "@solana/web3.js";
import { execSync } from "child_process";
import { DataCredits } from "../../target/types/data_credits";
import { HeliumSubDaos } from "../../target/types/helium_sub_daos";
import { HeliumEntityManager } from "../../target/types/helium_entity_manager";
import { initTestDao, initTestSubdao } from "./daos";
import { random } from "./string";
import { createAtaAndMint, createMint } from "@helium/spl-utils";
import { ThresholdType } from "../../packages/circuit-breaker-sdk/src"
import { getConcurrentMerkleTreeAccountSize, SPL_ACCOUNT_COMPRESSION_PROGRAM_ID } from "@solana/spl-account-compression";
import { VoterStakeRegistry } from "@helium/idls/lib/types/voter_stake_registry";

// TODO: replace this with helium default uri once uploaded
const DEFAULT_METADATA_URL =
  "https://c3zu2nc2m4x6zvqf5lofrtdbsa4niuh6drvzi7lq4n465ykbd3fa.arweave.net/FvNNNFpnL-zWBercWMxhkDjUUP4ca5R9cON57uFBHso/";

export const DC_FEE = 5000000;

export const initTestDataCredits = async (
  program: Program<DataCredits>,
  provider: anchor.AnchorProvider,
  startingHntbal?: number,
  hntMint?: PublicKey,
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
    .accounts({ hntMint, dcMint, hntPriceOracle: HNT_PYTH_PRICE_FEED });

  const dcKey = (await initDataCredits.pubkeys()).dataCredits!;

  await initDataCredits.rpc({ skipPreflight: true });

  return { dcKey, hntMint, hntBal, dcMint, dcBal };
};

export const initTestHotspotConfig = async (
  program: Program<HeliumEntityManager>,
  provider: anchor.AnchorProvider,
  subDao: PublicKey,
  dcMint?: PublicKey
): Promise<{
  collection: PublicKey;
  hotspotConfig: PublicKey;
}> => {
  if (!dcMint) {
    dcMint = await createMint(
      provider,
      6,
      provider.wallet.publicKey,
      provider.wallet.publicKey
    );
  }

  const merkle = Keypair.generate();
  // Testing -- small tree
  const space = getConcurrentMerkleTreeAccountSize(3, 8);
  const method = await program.methods
    .initializeHotspotConfigV0({
      name: "Helium Network Hotspots",
      symbol: random(), // symbol is unique would need to restart localnet everytime
      metadataUrl: DEFAULT_METADATA_URL,
      settings: {
        iotConfig: {
          minGain: 10,
          maxGain: 150,
          fullLocationStakingFee: toBN(1000000, 0),
          dataonlyLocationStakingFee: toBN(500000, 0),
        } as any,
      },
      maxDepth: 3,
      maxBufferSize: 8,
    })
    .accounts({
      subDao,
      merkleTree: merkle.publicKey,
    })
    .preInstructions([
      SystemProgram.createAccount({
        fromPubkey: provider.wallet.publicKey,
        newAccountPubkey: merkle.publicKey,
        lamports: await provider.connection.getMinimumBalanceForRentExemption(
          space
        ),
        space: space,
        programId: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
      }),
    ])
    .signers([merkle]);

  const { collection, hotspotConfig } = await method.pubkeys();
  await method.rpc();

  return {
    collection: collection!,
    hotspotConfig: hotspotConfig!,
  };
};

export const initTestHotspotIssuer = async (
  program: Program<HeliumEntityManager>,
  provider: anchor.AnchorProvider,
  hotspotConfig: PublicKey,
): Promise<{
  hotspotIssuer: PublicKey;
  makerKeypair: Keypair;
}> => {
  const makerKeypair = Keypair.generate();
  const method = await program.methods
    .initializeHotspotIssuerV0({
      maker: makerKeypair.publicKey,
      authority: provider.wallet.publicKey,
    })
    .accounts({
      hotspotConfig,
    });

  const { hotspotIssuer } = await method.pubkeys();
  await method.rpc({ skipPreflight: true });

  return {
    hotspotIssuer: hotspotIssuer!,
    makerKeypair,
  };
};

export async function ensureDCIdl(dcProgram: Program<DataCredits>) {
  try {
    execSync(
      `anchor idl init --filepath ${__dirname}/../../target/idl/data_credits.json ${dcProgram.programId}`,
      { stdio: "inherit" }
    );
  } catch {
    execSync(
      `anchor idl upgrade --filepath ${__dirname}/../../target/idl/data_credits.json ${dcProgram.programId}`,
      { stdio: "inherit" }
    );
  }
}

export async function ensureHSDIdl(hsdProgram: Program<HeliumSubDaos>) {
  try {
    execSync(
      `anchor idl init --filepath ${__dirname}/../../target/idl/helium_sub_daos.json ${hsdProgram.programId}`,
      { stdio: "inherit" }
    );
  } catch {
    execSync(
      `anchor idl upgrade --filepath ${__dirname}/../../target/idl/helium_sub_daos.json ${hsdProgram.programId}`,
      { stdio: "inherit" }
    );
  }
}

export async function ensureVSRIdl(vsrProgram: Program<VoterStakeRegistry>) {
  try {
    execSync(
      `anchor idl init --filepath ${__dirname}/../../target/idl/voter_stake_registry.json ${vsrProgram.programId}`,
      { stdio: "inherit" }
    );
  } catch {
    execSync(
      `anchor idl upgrade --filepath ${__dirname}/../../target/idl/voter_stake_registry.json ${vsrProgram.programId}`,
      { stdio: "inherit" }
    );
  }
}


export const initWorld = async (
  provider: anchor.AnchorProvider,
  hemProgram: Program<HeliumEntityManager>,
  hsdProgram: Program<HeliumSubDaos>,
  dcProgram: Program<DataCredits>,
  epochRewards?: number,
  subDaoEpochRewards?: number,
  registrar?: PublicKey,
  hntMint?: PublicKey
): Promise<{
  dao: { mint: PublicKey; dao: PublicKey; };
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
  hotspotConfig: {
    collection: PublicKey;
    hotspotConfig: PublicKey;
  };
  issuer: {
    hotspotIssuer: PublicKey;
    makerKeypair: Keypair;
  };
}> => {
  const dataCredits = await initTestDataCredits(dcProgram, provider, undefined, hntMint);

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
    subDaoEpochRewards
  );

  const hotspotConfig = await initTestHotspotConfig(
    hemProgram,
    provider,
    subDao.subDao,
    dataCredits.dcMint
  );

  const issuer = await initTestHotspotIssuer(
    hemProgram,
    provider,
    hotspotConfig.hotspotConfig,
  );

  return {
    dao,
    subDao,
    dataCredits,
    hotspotConfig,
    issuer,
  };
};
