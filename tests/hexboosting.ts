import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { init as initDataCredits, mintDataCredits } from "@helium/data-credits-sdk";
import { init as initHeliumSubDaos } from "@helium/helium-sub-daos-sdk";
import { Hexboosting } from "@helium/idls/lib/types/hexboosting";
import { MobileEntityManager } from "@helium/idls/lib/types/mobile_entity_manager";
import { createAtaAndMint, createMint, toBN } from "@helium/spl-utils";
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
    "DQ4C1tzvu28cwo1roN1Wm6TW35sfJEjLh517k3ZeWevx"
  );

  let hemProgram: Program<HeliumEntityManager>;
  let hsdProgram: Program<HeliumSubDaos>;
  let dcProgram: Program<DataCredits>;
  let memProgram: Program<MobileEntityManager>;
  let carrier: PublicKey;
  let merkle: Keypair;
  let subDao: PublicKey;

  let program: Program<Hexboosting>;

  before(async () => {
    await ensureDCIdl();
    await ensureMemIdl();
    await ensureHSDIdl();
    await ensureHEMIdl();
  });

  beforeEach(async () => {
    program = await init(
      provider,
      anchor.workspace.Hexboosting.programId,
      anchor.workspace.Hexboosting.idl
    );
    dcProgram = await initDataCredits(
      provider,
      anchor.workspace.DataCredits.programId,
      anchor.workspace.DataCredits.idl
    );

    memProgram = await initMobileEntityManager(
      provider,
      anchor.workspace.MobileEntityManager.programId,
      anchor.workspace.MobileEntityManager.idl
    );

    hsdProgram = await initHeliumSubDaos(
      provider,
      anchor.workspace.HeliumSubDaos.programId,
      anchor.workspace.HeliumSubDaos.idl
    );

    hemProgram = await initHeliumEntityManager(
      provider,
      anchor.workspace.HeliumEntityManager.programId,
      anchor.workspace.HeliumEntityManager.idl
    );
    const dataCredits = await initTestDataCredits(dcProgram, provider);
    const hntMint = await createMint(provider, 8, me, me);
    await createAtaAndMint(provider, hntMint, new BN("100000000000000"), me);
    await provider.sendAll(
      (await mintDataCredits({
        program: dcProgram,
        dcAmount: new BN("10000000000"),
        dcMint: dataCredits.dcMint,
      })).txs
    );
    
    const { dao } = await initTestDao(
      hsdProgram,
      provider,
      100,
      me,
      dataCredits.dcMint,
      hntMint
    );
    mint = dataCredits.dcMint;
    ({ subDao } = await initTestSubdao({
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
        incentiveEscrowFundBps: 100,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
      ])
      .accountsPartial({
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
      .accountsPartial({ carrier, newMerkleTree: merkle.publicKey })
      .preInstructions([createMerkle])
      .signers([merkle])
      .rpc({ skipPreflight: true });
    await memProgram.methods
      .approveCarrierV0()
      .accountsPartial({ carrier })
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
      .accountsPartial({
        startAuthority: me,
        dcMint: mint,
        priceOracle,
        rentReclaimAuthority: me,
        subDao,
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
    let boostConfig: PublicKey;

    beforeEach(async () => {
      const {
        pubkeys: { boostConfig: boostConfigK },
      } = await program.methods
        .initializeBoostConfigV0({
          boostPrice: toBN(0.005, 6),
          periodLength: 60 * 60 * 24 * 30, // roughly one month,
          minimumPeriods: 6,
        })
        .accountsPartial({
          startAuthority: me,
          dcMint: mint,
          priceOracle,
          subDao,
          rentReclaimAuthority: me,
        })
        .rpcAndKeys({ skipPreflight: true });
      boostConfig = boostConfigK!;
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
          dcMint: mint,
        })
        .accountsPartial({
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
      expect(account.dcMint.toBase58()).to.eq(mint.toBase58());
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
        .accountsPartial({
          dcMint: mint,
          carrier,
          boostConfig,
        })
        .rpcAndKeys({ skipPreflight: true });

      const postBalance = (
        await getAccount(
          provider.connection,
          getAssociatedTokenAddressSync(mint, me)
        )
      ).amount;

      const expected = Number(
        BigInt(toBN((6 * 0.005), 6).toNumber())
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
          .accountsPartial({
            dcMint: mint,
            carrier,
            boostConfig,
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
          .accountsPartial({
            dcMint: mint,
            carrier,
            boostConfig,
          })
          .rpcAndKeys({ skipPreflight: true });

        const postBalance = (
          await getAccount(
            provider.connection,
            getAssociatedTokenAddressSync(mint, me)
          )
        ).amount;

        const expected = BigInt(toBN((3 * 0.005), 6).toNumber());
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
          .startBoostV1({
            startTs: new BN(1),
          })
          .accountsPartial({
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
            .startBoostV1({
              startTs: new BN(1),
            })
            .accountsPartial({
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
            .closeBoostV1()
            .accountsPartial({
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
