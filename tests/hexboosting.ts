import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Hexboosting } from "@helium/idls/lib/types/hexboosting";
import { PROGRAM_ID, init } from "../packages/hexboosting-sdk";
import { toBN } from "@helium/spl-utils";
import {
  ensureDCIdl,
  ensureHEMIdl,
  ensureHSDIdl,
  initWorld,
} from "./utils/fixtures";
import { init as initDataCredits } from "@helium/data-credits-sdk";
import { init as initHeliumSubDaos } from "@helium/helium-sub-daos-sdk";
import {
  dataOnlyConfigKey,
  init as initHeliumEntityManager,
  iotInfoKey,
  onboardIotHotspot,
  onboardMobileHotspot,
  updateIotMetadata,
  updateMobileMetadata,
} from "../packages/helium-entity-manager-sdk/src";
import { DataCredits } from "../target/types/data_credits";
import { HeliumEntityManager } from "../target/types/helium_entity_manager";
import { NoEmit } from "../target/types/no_emit";
import { HeliumSubDaos } from "../target/types/helium_sub_daos";
import { PublicKey, Keypair } from "@solana/web3.js";
import { expect } from "chai";
import { init as initPo } from "@helium/price-oracle-sdk";
import { PriceOracle } from "@helium/idls/lib/types/price_oracle";

describe("hexboosting", () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;
  let mint: PublicKey;

  let hemProgram: Program<HeliumEntityManager>;
  let hsdProgram: Program<HeliumSubDaos>;
  let dcProgram: Program<DataCredits>;
  let poProgram: Program<PriceOracle>;

  let program: Program<Hexboosting>;
  beforeEach(async () => {
    poProgram = await initPo(
      provider,
      anchor.workspace.PriceOracle.programId,
      anchor.workspace.PriceOracle.idl
    );
    dcProgram = await initDataCredits(
      provider,
      anchor.workspace.DataCredits.programId,
      anchor.workspace.DataCredits.idl
    );
    await ensureDCIdl(dcProgram);

    hsdProgram = await initHeliumSubDaos(
      provider,
      anchor.workspace.HeliumSubDaos.programId,
      anchor.workspace.HeliumSubDaos.idl
    );
    await ensureHSDIdl(hsdProgram);

    hemProgram = await initHeliumEntityManager(
      provider,
      anchor.workspace.HeliumEntityManager.programId,
      anchor.workspace.HeliumEntityManager.idl
    );
    await ensureHEMIdl(hemProgram);
    program = await init(
      provider,
      PROGRAM_ID,
      anchor.workspace.Hexboosting.idl
    );
    ({
      subDao: { mint },
    } = await initWorld(provider, hemProgram, hsdProgram, dcProgram, 0, 0));
  });

  it("allows initialize a boost config", async () => {
    const kp = Keypair.generate();
    const {
      pubkeys: { priceOracle },
    } = await poProgram.methods
      .initializePriceOracleV0({
        oracles: [
          {
            authority: me,
            lastSubmittedPrice: null,
            lastSubmittedTimestamp: null,
          },
        ],
        decimals: 6,
        authority: me,
      })
      .accounts({
        priceOracle: kp.publicKey,
        payer: me,
      })
      .signers([kp])
      .rpcAndKeys({ skipPreflight: true });
    const {
      pubkeys: { boostConfig },
    } = await program.methods
      .initializeBoostConfigV0({
        boostPrice: toBN(0.005, 6),
        periodLength: 60 * 60 * 24 * 30, // roughly one month,
        minimumPeriods: 6,
      })
      .accounts({
        paymentMint: mint,
        priceOracle,
      })
      .rpcAndKeys({ skipPreflight: true });

    const config = await program.account.boostConfigV0.fetch(boostConfig!);
    expect(config.boostPrice.toNumber()).to.eq(5000);
    expect(config.periodLength).to.eq(60 * 60 * 24 * 30);
    expect(config.minimumPeriods).to.eq(6);
    expect(config.priceOracle.toBase58()).to.eq(priceOracle?.toBase58());
    expect(config.paymentMint.toBase58()).to.eq(mint.toBase58());
  });

  describe("with boost config and price", () => {
    let priceOracle: PublicKey | undefined;

    beforeEach(async () => {
      const kp = Keypair.generate();
      ({
        pubkeys: { priceOracle },
      } = await poProgram.methods
        .initializePriceOracleV0({
          oracles: [
            {
              authority: me,
              lastSubmittedPrice: null,
              lastSubmittedTimestamp: null,
            },
          ],
          decimals: 6,
          authority: me,
        })
        .accounts({
          priceOracle: kp.publicKey,
          payer: me,
        })
        .signers([kp])
        .rpcAndKeys({ skipPreflight: true }));
      await program.methods
        .initializeBoostConfigV0({
          boostPrice: toBN(0.005, 6),
          periodLength: 60 * 60 * 24 * 30, // roughly one month,
          minimumPeriods: 6,
        })
        .accounts({
          paymentMint: mint,
          priceOracle,
        })
        .rpcAndKeys({ skipPreflight: true });

      await poProgram.methods
        .submitPriceV0({
          oracleIndex: 0,
          price: toBN(0.002, 6),
        })
        .accounts({
          priceOracle,
        })
        .rpc({ skipPreflight: true });
    });

    it("does the initial boost", async () => {

    })
  });
});
