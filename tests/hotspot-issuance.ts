import { expect } from "chai";
import * as anchor from "@project-serum/anchor";
import { BN, Program } from "@project-serum/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { Keypair as HeliumKeypair } from "@helium/crypto";
import { execute, toBN } from "@helium-foundation/spl-utils";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
import { createAtaAndMint } from "./utils/token";
import { random } from "./utils/string";
import { DataCredits } from "../target/types/data_credits";
import {
  init as initDataCredits,
  mintDataCreditsInstructions,
  PROGRAM_ID as DATA_CREDITS_PROGRAM_ID,
} from "../packages/data-credits-sdk/src";
import { initTestDataCredits } from "./data-credits";
import { HeliumSubDaos } from "../target/types/helium_sub_daos";
import {
  init as initHeliumSubDaos,
  PROGRAM_ID as HELIUM_SUB_DAOS_PROGRAM_ID,
} from "../packages/helium-sub-daos-sdk/src";
import { initTestDao, initTestSubdao } from "./helium-sub-daos";
import { HotspotIssuance } from "../target/types/hotspot_issuance";
import { init as initHotspotIssuance } from "../packages/hotspot-issuance-sdk/src";

// TODO: replace this with helium default uri once uploaded
const DEFAULT_METADATA_URL =
  "https://c3zu2nc2m4x6zvqf5lofrtdbsa4niuh6drvzi7lq4n465ykbd3fa.arweave.net/FvNNNFpnL-zWBercWMxhkDjUUP4ca5R9cON57uFBHso/";

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
    .accounts({
      payer: provider.wallet.publicKey,
      tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
    });

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
      payer: provider.wallet.publicKey,
      hotspotConfig,
    });

  const { hotspotIssuer } = await method.pubkeys();
  await method.rpc();

  return {
    hotspotIssuer: hotspotIssuer!,
    makerKeypair,
  };
};

describe("hotspot-issuance", () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  let dcProgram: Program<DataCredits>;
  let hsdProgram: Program<HeliumSubDaos>;
  let hsProgram: Program<HotspotIssuance>;

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;

  before(async () => {
    dcProgram = await initDataCredits(
      provider,
      anchor.workspace.DataCredits.programId,
      anchor.workspace.DataCredits.idl
    );

    hsdProgram = await initHeliumSubDaos(
      provider,
      anchor.workspace.HeliumSubDaos.programId,
      anchor.workspace.HeliumSubDaos.idl
    );

    hsProgram = await initHotspotIssuance(
      provider,
      anchor.workspace.HotspotIssuance.programId,
      anchor.workspace.HotspotIssuance.idl
    );

    await initWorld();
  });

  const initWorld = async (): Promise<{
    dao: { mint: PublicKey; dao: PublicKey; treasury: PublicKey };
    subDao: {
      mint: PublicKey;
      subDao: PublicKey;
      collection: PublicKey;
      treasury: PublicKey;
    };
    dataCredits: {
      dcKey: PublicKey;
      hntMint: PublicKey;
      hntBal: number;
      dcMint: PublicKey;
      dcBal: number;
    };
  }> => {
    const dao = await initTestDao(hsdProgram, provider);
    const subDao = await initTestSubdao(hsdProgram, provider, dao.dao);
    const dataCredits = await initTestDataCredits(dcProgram, provider);

    return {
      dao,
      subDao,
      dataCredits,
    };
  };

  it("initializes a hotspot config", async () => {
    const { hotspotConfig, collection, onboardingServerKeypair } =
      await initTestHotspotConfig(hsProgram, provider);

    const account = await hsProgram.account.hotspotConfigV0.fetch(
      hotspotConfig
    );

    expect(account.authority.toBase58()).eq(
      onboardingServerKeypair.publicKey.toBase58()
    );
    expect(account.collection.toBase58()).eq(collection.toBase58());
    expect(account.dcFee.toString()).eq(toBN(1, 8).toString());
    expect(account.onboardingServer.toBase58()).eq(
      onboardingServerKeypair.publicKey.toBase58()
    );
  });

  it("initializes a hotspot issuer", async () => {
    const { hotspotConfig } = await initTestHotspotConfig(hsProgram, provider);
    const { hotspotIssuer, makerKeypair } = await initTestHotspotIssuer(
      hsProgram,
      provider,
      hotspotConfig
    );

    const account = await hsProgram.account.hotspotIssuerV0.fetch(
      hotspotIssuer
    );

    expect(account.authority.toBase58()).eq(me.toBase58());
    expect(account.count.toNumber()).eq(0);
    expect(account.maker.toBase58()).eq(makerKeypair.publicKey.toBase58());
  });

  describe("with issuer and data credits", () => {
    let dcMint: PublicKey;
    let subDao: PublicKey;

    before(async () => {
      const ix = await mintDataCreditsInstructions({
        program: dcProgram,
        provider,
        amount: 1,
      });

      await execute(dcProgram, provider, ix);

      const { subDao: sub, dataCredits } = await initWorld();

      subDao = sub.subDao;
      dcMint = dataCredits.dcMint;
    });

    it("issues a hotspot", async () => {
      const ecc = await (await HeliumKeypair.makeRandom()).address.bin;
      const hotspotOwner = Keypair.generate().publicKey;
      const { hotspotConfig, collection, onboardingServerKeypair } =
        await initTestHotspotConfig(hsProgram, provider);

      const { hotspotIssuer, makerKeypair } = await initTestHotspotIssuer(
        hsProgram,
        provider,
        hotspotConfig
      );

      const method = await hsProgram.methods
        .issueHotspotV0({ eccCompact: ecc })
        .accounts({
          payer: me,
          dcFeePayer: me,
          onboardingServer: onboardingServerKeypair.publicKey,
          maker: makerKeypair.publicKey,
          hotspotOwner: hotspotOwner,
          collection,
          dcMint,
          subDao,
          tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
          dataCreditsProgram: DATA_CREDITS_PROGRAM_ID,
          subDaosProgram: HELIUM_SUB_DAOS_PROGRAM_ID,
        })
        .signers([onboardingServerKeypair, makerKeypair]);

      const { hotspot } = await method.pubkeys();
      console.log(hotspot?.toBase58());
      await method.rpc();

      const ata = await getAssociatedTokenAddress(hotspot!, hotspotOwner);
      const ataBal = await provider.connection.getTokenAccountBalance(ata);
      const issuerAccount = await hsProgram.account.hotspotIssuerV0.fetch(
        hotspotIssuer
      );

      expect(ataBal.value.uiAmount).eq(1);
      expect(issuerAccount.count.toNumber()).eq(1);
    });
  });
});
