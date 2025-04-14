import { PriceOracle } from "@helium/idls/lib/types/price_oracle";
import { sendInstructions } from "@helium/spl-utils";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { BN } from "bn.js";
import { expect } from "chai";
import {
  init,
  PROGRAM_ID,
} from "../packages/price-oracle-sdk";


describe("price-oracle", () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;

  let program: Program<PriceOracle>;
  beforeEach(async () => {
    program = await init(
      provider,
      PROGRAM_ID,
      anchor.workspace.PriceOracle.idl
    );

  });

  it("initializes a price oracle", async () => {
    const kp = Keypair.generate();
    const oracles: any[] = [{
      authority: Keypair.generate().publicKey,
      lastSubmittedPrice: null,
      lastSubmittedTimestamp: null,
    }];

    await program.methods.initializePriceOracleV0({
      oracles,
      decimals: 8,
      authority: me
    }).accountsPartial({
      priceOracle: kp.publicKey,
      payer: me,
    }).signers([kp])
    .rpc({skipPreflight: true});

    const priceOracle = await program.account.priceOracleV0.fetch(kp.publicKey);
    
    expect(priceOracle.numOracles).to.eq(oracles.length);
    expect(priceOracle.decimals).to.eq(8);
    expect(priceOracle.authority.toBase58()).to.eq(me.toBase58());
    expect(priceOracle.currentPrice).to.be.null;
    expect(priceOracle.lastCalculatedTimestamp).to.be.null;
    expect(priceOracle.oracles).to.deep.equal(oracles);
  });

  describe("with price oracle", async() => {
    let priceOracle: PublicKey;
    let oracles: Keypair[] = [];

    beforeEach(async() => {
      const kp = Keypair.generate();
      priceOracle = kp.publicKey;
      oracles = [0, 1, 2].map((i) => Keypair.generate());

      await program.methods.initializePriceOracleV0({
        oracles: oracles.map((o) => {
          return {
            authority: o.publicKey,
            lastSubmittedPrice: null,
            lastSubmittedTimestamp: null,
          }
        }),
        decimals: 8,
        authority: me,
      }).accountsPartial({
        priceOracle: kp.publicKey,
        payer: me,
      }).signers([kp])
      .rpc({skipPreflight: true});
      priceOracle = kp.publicKey;
    })

    it ("updates the price oracle", async () => {
      const oracles: any[] = [
        {
          authority: Keypair.generate().publicKey,
          lastSubmittedPrice: null,
          lastSubmittedTimestamp: null,
        },
      ];
      await program.methods
        .updatePriceOracleV0({
          oracles: oracles.map((o) => {
            return {
              authority: o.authority,
              lastSubmittedPrice: null,
              lastSubmittedTimestamp: null,
            };
          }).slice(0, 1),
          authority: me,
        })
        .accountsPartial({
          priceOracle,
        })
        .rpc({ skipPreflight: true });

      const priceOracleAcc = await program.account.priceOracleV0.fetch(priceOracle);

      expect(priceOracleAcc.authority.toBase58()).to.eq(me.toBase58());
      expect(priceOracleAcc.numOracles).to.eq(1);
      expect(priceOracleAcc.decimals).to.eq(8);
      expect(priceOracleAcc.currentPrice).to.be.null;
      expect(priceOracleAcc.lastCalculatedTimestamp).to.be.null;
      expect(priceOracleAcc.oracles).to.deep.equal(oracles);
    })

    it("oracle can submit a price", async () => {
      const price = new BN(1000);
      await program.methods.submitPriceV0({
        oracleIndex: 0,
        price,
      }).accountsPartial({
        priceOracle,
        oracle: oracles[0].publicKey
      }).signers([oracles[0]]).rpc({skipPreflight: true});

      const priceOracleAcc = await program.account.priceOracleV0.fetch(priceOracle);
      const lastSubmittedPrice = priceOracleAcc.oracles[0].lastSubmittedPrice;
      expect(lastSubmittedPrice && price.eq(priceOracleAcc.oracles[0].lastSubmittedPrice!)).to.be.true;
      expect(priceOracleAcc.oracles[0].lastSubmittedTimestamp).to.not.be.null;
      expect(priceOracleAcc.currentPrice).to.be.null;
      expect(priceOracleAcc.lastCalculatedTimestamp).to.be.null;
    });

    it("non oracle can't submit a price", async () => {
      try {
        await program.methods.submitPriceV0({
          oracleIndex: 0,
          price: new BN(1000),
        }).accountsPartial({
          priceOracle,
          oracle: oracles[0].publicKey
        }).rpc({skipPreflight: true});
        throw new Error("Should have failed");
      } catch(e: any) {
        expect(e.toString()).to.not.include("Should have failed");
      }
    });

    it("updates the current price", async () => {
      const instructions = oracles.map((x, i) => {
        const price = new BN(i * 1000);
        return program.methods.submitPriceV0({
          oracleIndex: i,
          price,
        }).accountsPartial({
          priceOracle,
          oracle: x.publicKey
        }).signers([x]).instruction();
      });
      const ixs = await Promise.all(instructions);
      await sendInstructions(provider, ixs, oracles);

      const priceOracleAcc = await program.account.priceOracleV0.fetch(priceOracle);
      expect(priceOracleAcc.currentPrice?.eq(new BN(1000)));
      expect(priceOracleAcc.lastCalculatedTimestamp).to.not.be.null;
    });
  })
});