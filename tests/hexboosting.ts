import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Hexboosting } from "@helium/idls/lib/types/hexboosting";
import {
  PROGRAM_ID,
  boostConfigKey,
  boostedHexKey,
  init,
} from "../packages/hexboosting-sdk";
import { toBN } from "@helium/spl-utils";
import { getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";
import {
  ensureDCIdl,
  ensureHEMIdl,
  ensureHSDIdl,
  ensureMemIdl,
  initTestDataCredits,
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
import {
  PublicKey,
  Keypair,
  ComputeBudgetProgram,
  SystemProgram,
} from "@solana/web3.js";
import { expect } from "chai";
import { init as initPo } from "@helium/price-oracle-sdk";
import { PriceOracle } from "@helium/idls/lib/types/price_oracle";
import { BN } from "bn.js";
import { MobileEntityManager } from "@helium/idls/lib/types/mobile_entity_manager";
import { init as initMobileEntityManager } from "../packages/mobile-entity-manager-sdk/src";
import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  getConcurrentMerkleTreeAccountSize,
} from "@solana/spl-account-compression";
import { random } from "./utils/string";
import { initTestDao, initTestSubdao } from "./utils/daos";

describe("hexboosting", () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;
  let mint: PublicKey;
  let periodLength = 60 * 60 * 24 * 30; // roughly one month

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
        periodLength,
        minimumPeriods: 6,
      })
      .accounts({
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
          dntMint: mint,
          priceOracle,
          rentReclaimAuthority: me,
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
          startTs: new BN(0),
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

      expect(preBalance - postBalance).to.eq(BigInt(toBN(15, 6).toNumber()));

      const hex = await program.account.boostedHexV0.fetch(boostedHex!);

      expect(hex.location.toNumber()).to.eq(1);
      expect(hex.startTs.toNumber()).to.eq(0);
      expect(hex.boostsByPeriod.toJSON().data).to.deep.eq([1, 1, 1, 1, 1, 1]);
    });

    describe("with initial minimum boost", () => {
      beforeEach(async () => {
        await program.methods
          .boostV0({
            location: new BN(1),
            startTs: new BN(0),
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
            startTs: new BN(0),
            amounts: [
              {
                period: 2,
                amount: 1,
              },
              {
                period: 50,
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

        expect(preBalance - postBalance).to.eq(BigInt(toBN(7.5, 6).toNumber()));

        const hex = await program.account.boostedHexV0.fetch(boostedHex!);

        expect(hex.boostsByPeriod.toJSON().data).to.deep.eq([
          1,
          1,
          2,
          1,
          1,
          1,
          ...new Array(44).fill(0),
          2,
        ]);
      });

      it("allows starting a boost", async () => {
        const boostedHex = boostedHexKey(boostConfigKey(mint)[0], new BN(1))[0];
        await program.methods
          .startBoostV0()
          .accounts({
            boostedHex,
            carrier,
          })
          .rpc({ skipPreflight: true });
        const acc = await program.account.boostedHexV0.fetch(boostedHex!);
        expect(acc.startTs.toNumber()).to.not.eq(0);
      });

      describe("with started boost", () => {
        before(() => {
          // Make periods one second so we can retire this
          periodLength = 1;
        })

        beforeEach(async () => {
          const boostedHex = boostedHexKey(
            boostConfigKey(mint)[0],
            new BN(1)
          )[0];
          await program.methods
            .startBoostV0()
            .accounts({
              boostedHex,
              carrier,
            })
            .rpc({ skipPreflight: true });
        });

        it("allows closing the boost when it's done", async () => {
          const boostedHex = boostedHexKey(
            boostConfigKey(mint)[0],
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
