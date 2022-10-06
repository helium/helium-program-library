import { execute, sendInstructions, toBN } from "@helium-foundation/spl-utils";
import { Keypair as HeliumKeypair } from "@helium/crypto";
import { PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import {
  init as initDataCredits,
  mintDataCreditsInstructions,
  PROGRAM_ID as DATA_CREDITS_PROGRAM_ID
} from "../packages/data-credits-sdk/src";
import {
  init as initHeliumSubDaos,
  PROGRAM_ID as HELIUM_SUB_DAOS_PROGRAM_ID
} from "../packages/helium-sub-daos-sdk/src";
import { init as initHotspotIssuance } from "../packages/hotspot-issuance-sdk/src";
import { DataCredits } from "../target/types/data_credits";
import { HeliumSubDaos } from "../target/types/helium_sub_daos";
import { HotspotIssuance } from "../target/types/hotspot_issuance";
import { ensureDCIdl, initTestHotspotConfig, initTestHotspotIssuer, initWorld } from "./utils/fixtures";

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

    ensureDCIdl(dcProgram);

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
  });

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
    let subDao: PublicKey;
    let makerKeypair: Keypair;
    let onboardingServerKeypair: Keypair;
    let hotspotIssuer: PublicKey;

    before(async () => {
      const { 
        subDao: sub, 
        dataCredits,
        hotspotConfig: hsConfig,
        issuer
       } = await initWorld(provider, hsProgram, hsdProgram, dcProgram);
      const ix = await mintDataCreditsInstructions({
        program: dcProgram,
        provider,
        amount: 1,
      });

      console.log(dataCredits.dcMint.toBase58());
      console.log(dataCredits.dcKey.toBase58());
      await execute(dcProgram, provider, ix);

      subDao = sub.subDao;
      hotspotIssuer = issuer.hotspotIssuer;
      makerKeypair = issuer.makerKeypair;
      ({ onboardingServerKeypair } = hsConfig);
    });

    it("issues a hotspot", async () => {
      const ecc = await (await HeliumKeypair.makeRandom()).address.publicKey;
      const hotspotOwner = Keypair.generate().publicKey;

      const method = await hsProgram.methods
        .issueHotspotV0({ eccCompact: Buffer.from(ecc) })
        .accounts({
          hotspotIssuer,
          hotspotOwner,
          onboardingServer: onboardingServerKeypair.publicKey,
          maker: makerKeypair.publicKey,
          subDao,
        })
        .signers([onboardingServerKeypair, makerKeypair]);

      const { hotspot } = await method.pubkeys();
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
