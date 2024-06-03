import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { init as initDataCredits } from "@helium/data-credits-sdk";
import { init as initHeliumSubDaos } from "@helium/helium-sub-daos-sdk";
import { Hexboosting } from "@helium/idls/lib/types/hexboosting";
import { MobileEntityManager } from "@helium/idls/lib/types/mobile_entity_manager";
import { PriceOracle } from "@helium/idls/lib/types/price_oracle";
import { init as initPo } from "@helium/price-oracle-sdk";
import { toBN } from "@helium/spl-utils";
import { parsePriceData } from "@pythnetwork/client";
import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  getConcurrentMerkleTreeAccountSize,
} from "@solana/spl-account-compression";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { BN } from "bn.js";
import { expect } from "chai";
import { init as initHeliumEntityManager } from "../packages/helium-entity-manager-sdk/src";
import {
  boostConfigKey,
  boostedHexKey,
  init,
} from "../packages/hexboosting-sdk";
import { init as initMobileEntityManager } from "../packages/mobile-entity-manager-sdk/src";
import { DataCredits } from "../target/types/data_credits";
import { HeliumEntityManager } from "../target/types/helium_entity_manager";
import { HeliumSubDaos } from "../target/types/helium_sub_daos";
import { initTestDao, initTestSubdao } from "./utils/daos";
import {
  ensureDCIdl,
  ensureHEMIdl,
  ensureHSDIdl,
  ensureMemIdl,
  initTestDataCredits,
} from "./utils/fixtures";
import { random } from "./utils/string";


describe("hexboosting", () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;
  let mint: PublicKey;
  let periodLength = 60 * 60 * 24 * 30; // roughly one month

  const priceOracle: PublicKey = new PublicKey(
    "JBaTytFv1CmGNkyNiLu16jFMXNZ49BGfy4bYAYZdkxg5"
  );

  let hemProgram: Program<HeliumEntityManager>;
  let hsdProgram: Program<HeliumSubDaos>;
  let dcProgram: Program<DataCredits>;
  let poProgram: Program<PriceOracle>;
  let memProgram: Program<MobileEntityManager>;
  let carrier: PublicKey;
  let merkle: Keypair;
  let subDao: PublicKey;

  let program: Program<Hexboosting>;
  beforeEach(async () => {
    program = await init(
      provider,
      anchor.workspace.Hexboosting.programId,
      anchor.workspace.Hexboosting.idl
    );
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

    memProgram = await initMobileEntityManager(
      provider,
      anchor.workspace.MobileEntityManager.programId,
      anchor.workspace.MobileEntityManager.idl
    );
    ensureMemIdl(memProgram);

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
    const dataCredits = await initTestDataCredits(dcProgram, provider);
    const { dao } = await initTestDao(
      hsdProgram,
      provider,
      100,
      me,
      dataCredits.dcMint
    );
    ({ subDao, mint } = await initTestSubdao({
      hsdProgram,
      provider,
      authority: me,
      dao,
      numTokens: new anchor.BN("1000000000000000"),
    }));
    const name = random();
    const {
      pubkeys: { carrier: carrierK },
    } = await memProgram.methods
      .initializeCarrierV0({
        name,
        issuingAuthority: me,
        updateAuthority: me,
        hexboostAuthority: me,
        metadataUrl: "https://some/url",
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
      ])
      .accounts({
        subDao,
      })
      .rpcAndKeys({ skipPreflight: true });
    carrier = carrierK!;
    merkle = Keypair.generate();
    // Testing -- small tree
    const space = getConcurrentMerkleTreeAccountSize(3, 8);
    const createMerkle = SystemProgram.createAccount({
      fromPubkey: provider.wallet.publicKey,
      newAccountPubkey: merkle.publicKey,
      lamports: await provider.connection.getMinimumBalanceForRentExemption(
        space
      ),
      space: space,
      programId: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
    });
    await memProgram.methods
      .updateCarrierTreeV0({
        maxDepth: 3,
        maxBufferSize: 8,
      })
      .accounts({ carrier, newMerkleTree: merkle.publicKey })
      .preInstructions([createMerkle])
      .signers([merkle])
      .rpc({ skipPreflight: true });
    await memProgram.methods
      .approveCarrierV0()
      .accounts({ carrier })
      .rpc({ skipPreflight: true });
  });

  it("allows initialize a boost config", async () => {
    const {
      pubkeys: { boostConfig },
    } = await program.methods
      .initializeBoostConfigV0({
        boostPrice: toBN(0.005, 6),
        periodLength,
        minimumPeriods: 6,
      })
      .accounts({
        startAuthority: me,
        dntMint: mint,
        priceOracle,
        rentReclaimAuthority: me,
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
    let pythPrice: number = 0;

    beforeEach(async () => {
      await program.methods
        .initializeBoostConfigV0({
          boostPrice: toBN(0.005, 6),
          periodLength: 60 * 60 * 24 * 30, // roughly one month,
          minimumPeriods: 6,
        })
        .accounts({
          startAuthority: me,
          dntMint: mint,
          priceOracle,
          rentReclaimAuthority: me,
        })
        .rpcAndKeys({ skipPreflight: true });
      const pythData = (await provider.connection.getAccountInfo(priceOracle))!
        .data;
      const price = parsePriceData(pythData);
      pythPrice = price.emaPrice.value - price.emaConfidence!.value * 2;
    });

    it("allows updating boost config", async () => {
      const boostConfig = boostConfigKey(mint)[0];
      await program.methods
        .updateBoostConfigV0({
          boostPrice: toBN(0.006, 6),
          startAuthority: PublicKey.default,
          rentReclaimAuthority: PublicKey.default,
          minimumPeriods: 4,
          priceOracle: PublicKey.default,
        })
        .accounts({
          boostConfig,
        })
        .rpcAndKeys({ skipPreflight: true });
      const account = await program.account.boostConfigV0.fetch(boostConfig);
      expect(account.boostPrice.toNumber()).to.eq(6000);
      expect(account.startAuthority.toString()).to.eq(
        PublicKey.default.toBase58()
      );
      expect(account.rentReclaimAuthority.toString()).to.eq(
        PublicKey.default.toBase58()
      );
      expect(account.priceOracle.toString()).to.eq(
        PublicKey.default.toBase58()
      );
      expect(account.minimumPeriods).to.eq(4);
    });

    it("does the initial boost", async () => {
      const preBalance = (
        await getAccount(
          provider.connection,
          getAssociatedTokenAddressSync(mint, me)
        )
      ).amount;
      const {
        pubkeys: { boostedHex },
      } = await program.methods
        .boostV0({
          location: new BN(1),
          version: 0,
          deviceType: { wifiIndoor: {} },
          amounts: [
            {
              period: 0,
              amount: 1,
            },
            {
              period: 1,
              amount: 1,
            },
            {
              period: 2,
              amount: 1,
            },
            {
              period: 3,
              amount: 1,
            },
            {
              period: 4,
              amount: 1,
            },
            {
              period: 5,
              amount: 1,
            },
          ],
        })
        .accounts({
          paymentMint: mint,
          carrier,
        })
        .rpcAndKeys({ skipPreflight: true });

      const postBalance = (
        await getAccount(
          provider.connection,
          getAssociatedTokenAddressSync(mint, me)
        )
      ).amount;

      const expected = Number(
        BigInt(toBN((6 * 0.005) / pythPrice, 6).toNumber())
      );
      expect(Number(preBalance - postBalance)).to.be.within(
        expected - 1,
        expected
      );

      const hex = await program.account.boostedHexV1.fetch(boostedHex!);

      expect(Object.keys(hex.deviceType)[0]).to.eq("wifiIndoor");
      expect(hex.location.toNumber()).to.eq(1);
      expect(hex.startTs.toNumber()).to.eq(0);
      expect(hex.boostsByPeriod.toJSON().data).to.deep.eq([1, 1, 1, 1, 1, 1]);
    });

    describe("with initial minimum boost", () => {
      beforeEach(async () => {
        await program.methods
          .boostV0({
            location: new BN(1),
            version: 0,
            deviceType: { wifiIndoor: {} },
            amounts: [
              {
                period: 0,
                amount: 1,
              },
              {
                period: 1,
                amount: 1,
              },
              {
                period: 2,
                amount: 1,
              },
              {
                period: 3,
                amount: 1,
              },
              {
                period: 4,
                amount: 1,
              },
              {
                period: 5,
                amount: 1,
              },
            ],
          })
          .accounts({
            paymentMint: mint,
            carrier,
          })
          .rpcAndKeys({ skipPreflight: true });
      });

      it("allows adding additional boost to arbitrary other hexes", async () => {
        const preBalance = (
          await getAccount(
            provider.connection,
            getAssociatedTokenAddressSync(mint, me)
          )
        ).amount;
        const {
          pubkeys: { boostedHex },
        } = await program.methods
          .boostV0({
            location: new BN(1),
            version: 1,
            deviceType: { wifiIndoor: {} },
            amounts: [
              {
                period: 2,
                amount: 1,
              },
              {
                period: 6,
                amount: 2,
              },
            ],
          })
          .accounts({
            paymentMint: mint,
            carrier,
          })
          .rpcAndKeys({ skipPreflight: true });

        const postBalance = (
          await getAccount(
            provider.connection,
            getAssociatedTokenAddressSync(mint, me)
          )
        ).amount;

        const expected = BigInt(toBN((3 * 0.005) / pythPrice, 6).toNumber());
        const actual = preBalance - postBalance;
        expect(Number(actual)).to.be.within(
          Number(expected) - 1,
          Number(expected)
        );

        const hex = await program.account.boostedHexV1.fetch(boostedHex!);

        expect(hex.boostsByPeriod.toJSON().data).to.deep.eq([
          1, 1, 2, 1, 1, 1, 2,
        ]);
      });

      it("allows starting a boost", async () => {
        const boostedHex = boostedHexKey(
          boostConfigKey(mint)[0],
          { wifiIndoor: {} },
          new BN(1)
        )[0];
        await program.methods
          .startBoostV0({
            startTs: new BN(1),
          })
          .accounts({
            boostedHex,
          })
          .rpc({ skipPreflight: true });
        const acc = await program.account.boostedHexV1.fetch(boostedHex!);
        expect(acc.startTs.toNumber()).to.not.eq(0);
      });

      describe("with started boost", () => {
        before(() => {
          // Make periods one second so we can retire this
          periodLength = 1;
        });

        beforeEach(async () => {
          const boostedHex = boostedHexKey(
            boostConfigKey(mint)[0],
            { wifiIndoor: {} },
            new BN(1)
          )[0];
          await program.methods
            .startBoostV0({
              startTs: new BN(1),
            })
            .accounts({
              boostedHex,
            })
            .rpc({ skipPreflight: true });
        });

        it("allows closing the boost when it's done", async () => {
          const boostedHex = boostedHexKey(
            boostConfigKey(mint)[0],
            { wifiIndoor: {} },
            new BN(1)
          )[0];
          // Wait 7 seconds so it is fully expired
          await new Promise((resolve) => {
            setTimeout(resolve, 6000);
          });

          await program.methods
            .closeBoostV0()
            .accounts({
              boostedHex,
            })
            .rpc({ skipPreflight: true });

          expect(await provider.connection.getAccountInfo(boostedHex)).to.be
            .null;
        });
      });
    });
  });
});
