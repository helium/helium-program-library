import { toBN } from "@helium-foundation/spl-utils";
import { PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  dataCreditsKey,
  isInitialized
} from "../../packages/data-credits-sdk/src";
import { DataCredits } from "../../target/types/data_credits";
import { HeliumSubDaos } from "../../target/types/helium_sub_daos";
import { HotspotIssuance } from "../../target/types/hotspot_issuance";
import { initTestDao, initTestSubdao } from "../helium-sub-daos";
import { random } from "./string";
import { createAtaAndMint, createMint } from "./token";
import { execSync } from "child_process";

// TODO: replace this with helium default uri once uploaded
const DEFAULT_METADATA_URL =
  "https://c3zu2nc2m4x6zvqf5lofrtdbsa4niuh6drvzi7lq4n465ykbd3fa.arweave.net/FvNNNFpnL-zWBercWMxhkDjUUP4ca5R9cON57uFBHso/";

export const initTestDataCredits = async (
  program: Program<DataCredits>,
  provider: anchor.AnchorProvider,
  startingHntbal: number = 100
): Promise<{
  dcKey: PublicKey;
  hntMint: PublicKey;
  dcMint: PublicKey;
  hntBal: number;
  dcBal: number;
}> => {
  const dcKey = dataCreditsKey()[0];
  const me = provider.wallet.publicKey;
  let hntMint;
  let hntBal = startingHntbal;
  let dcMint;
  let dcBal = 0;

  if (await isInitialized(program)) {
    // accounts for rerunning tests on same localnet
    const dcAcc = await program.account.dataCreditsV0.fetch(dcKey);
    hntMint = dcAcc.hntMint;
    dcMint = dcAcc.dcMint;

    if (
      await provider.connection.getAccountInfo(
        await getAssociatedTokenAddress(dcMint, me)
      )
    ) {
      dcBal = (
        await provider.connection.getTokenAccountBalance(
          await getAssociatedTokenAddress(dcMint, me)
        )
      ).value.uiAmount!;
    }

    hntBal =
      (
        await provider.connection.getTokenAccountBalance(
          await getAssociatedTokenAddress(hntMint, me)
        )
      ).value.uiAmount || 0;
  } else {
    hntMint = await createMint(provider, 8, me, me);
    dcMint = await createMint(provider, 8, dcKey, dcKey);

    await createAtaAndMint(
      provider,
      hntMint,
      toBN(startingHntbal, 8).toNumber(),
      me
    );

    const initDataCredits = await program.methods
      .initializeDataCreditsV0({ authority: me })
      .accounts({ hntMint, dcMint });

    await initDataCredits.rpc();
  }

  return { dcKey, hntMint, hntBal, dcMint, dcBal };
};

export const initTestHotspotConfig = async (
  program: Program<HotspotIssuance>,
  provider: anchor.AnchorProvider
): Promise<{
  collection: PublicKey;
  hotspotConfig: PublicKey;
  onboardingServerKeypair: Keypair;
}> => {
  const onboardingServerKeypair = Keypair.generate();
  const method = await program.methods
    .initializeHotspotConfigV0({
      name: "Helium Network Hotspots",
      symbol: random(), // symbol is unique would need to restart localnet everytime
      metadataUrl: DEFAULT_METADATA_URL,
      dcFee: toBN(1, 8),
      onboardingServer: onboardingServerKeypair.publicKey,
    })

  const { collection, hotspotConfig } = await method.pubkeys();
  await method.rpc();

  return {
    collection: collection!,
    hotspotConfig: hotspotConfig!,
    onboardingServerKeypair,
  };
};

export const initTestHotspotIssuer = async (
  program: Program<HotspotIssuance>,
  provider: anchor.AnchorProvider,
  hotspotConfig: PublicKey
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
  await method.rpc();

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

export const initWorld = async (
  provider: anchor.AnchorProvider,
  hsProgram: Program<HotspotIssuance>,
  hsdProgram: Program<HeliumSubDaos>,
  dcProgram: Program<DataCredits>
): Promise<{
  dao: { mint: PublicKey; dao: PublicKey; treasury: PublicKey };
  subDao: {
    mint: PublicKey;
    subDao: PublicKey;
    treasury: PublicKey;
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
    onboardingServerKeypair: Keypair;
  };
  issuer: {
    hotspotIssuer: PublicKey;
    makerKeypair: Keypair;
  };
}> => {
  const hotspotConfig = await initTestHotspotConfig(hsProgram, provider);

  const dao = await initTestDao(hsdProgram, provider);
  const subDao = await initTestSubdao(
    hsdProgram,
    provider,
    dao.dao,
    hotspotConfig.collection
  );
  const dataCredits = await initTestDataCredits(dcProgram, provider);

  const issuer = await initTestHotspotIssuer(
    hsProgram,
    provider,
    hotspotConfig.hotspotConfig
  );

  return {
    dao,
    subDao,
    dataCredits,
    hotspotConfig,
    issuer
  };
};
