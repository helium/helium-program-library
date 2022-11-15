import { CircuitBreaker } from "@helium/idls/lib/types/circuit_breaker";
import { createAtaAndMint, createMint } from "@helium/spl-utils";
import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import { BN } from "bn.js";
import { expect } from "chai";
import {
  init,
  PROGRAM_ID,
  thresholdPercent,
  ThresholdType
} from "../packages/circuit-breaker-sdk";


describe("circuit-breaker", () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;

  let program: Program<CircuitBreaker>;
  beforeEach(async () => {
    program = await init(
      provider,
      PROGRAM_ID,
      anchor.workspace.CircuitBreaker.idl
    );
  });

  it("initializes a mint windowed breaker", async () => {
    const mint = await createMint(provider, 8, me, me);
    const method = await program.methods
      .initializeMintWindowedBreakerV0({
        authority: me,
        mintAuthority: me,
        config: {
          windowSizeSeconds: new BN(10),
          thresholdType: ThresholdType.Percent as never,
          threshold: thresholdPercent(50),
        } as never,
      })
      .accounts({
        mint,
      });
    const circuitBreaker = (await method.pubkeys()).circuitBreaker!;
    await method.rpc({ skipPreflight: true });

    const acct = await program.account.mintWindowedCircuitBreakerV0.fetch(
      circuitBreaker
    );
    expect(acct.lastWindow.lastAggregatedValue.toNumber()).to.eq(0);
    expect(acct.config.threshold.toString()).to.eq(thresholdPercent(50).toString());
    expect(acct.config.windowSizeSeconds.toNumber()).to.eq(10);
  });

  it("initializes an account windowed breaker", async () => {
    const mint = await createMint(provider, 8, me, me);
    const tokenAccount = await createAtaAndMint(provider, mint, 200);
    const method = await program.methods
      .initializeAccountWindowedBreakerV0({
        authority: me,
        owner: me,
        config: {
          windowSizeSeconds: new BN(10),
          thresholdType: ThresholdType.Percent as never,
          threshold: thresholdPercent(50),
        } as never,
      })
      .accounts({
        tokenAccount,
      });
    const circuitBreaker = (await method.pubkeys()).circuitBreaker!;
    await method.rpc({ skipPreflight: true });

    const acct = await program.account.accountWindowedCircuitBreakerV0.fetch(
      circuitBreaker
    );
    expect(acct.lastWindow.lastAggregatedValue.toNumber()).to.eq(0);
    expect(acct.config.threshold.toString()).to.eq(
      thresholdPercent(50).toString()
    );
    expect(acct.config.windowSizeSeconds.toNumber()).to.eq(10);
  });

  describe("with mint windowed breaker", () => {
    let mint: PublicKey;
    const INITIAL_SUPPLY = 200;

    beforeEach(async () => {
      mint = await createMint(provider, 8, me, me);
      const method = await program.methods
        .initializeMintWindowedBreakerV0({
          authority: me,
          mintAuthority: me,
          config: {
            windowSizeSeconds: new BN(10),
            thresholdType: ThresholdType.Percent as never,
            threshold: thresholdPercent(50),
          } as never,
        })
        .accounts({
          mint,
        });
      await createAtaAndMint(provider, mint, INITIAL_SUPPLY);
      await method.rpc({ skipPreflight: true });
    });

    it("updates the breaker window on mint", async () => {
      const dest = await getAssociatedTokenAddress(mint, me);
      const method = await program.methods
        .mintV0({
          amount: new BN(50),
        })
        .accounts({
          mint,
          to: dest,
        });
      const circuitBreaker = (await method.pubkeys()).circuitBreaker!;
      await method.rpc({ skipPreflight: true });
      const acct = await program.account.mintWindowedCircuitBreakerV0.fetch(
        circuitBreaker
      );

      expect(acct.lastWindow.lastAggregatedValue.toNumber()).to.eq(50);
      const unixTime = new Date().valueOf() / 1000;
      expect(acct.lastWindow.lastUnixTimestamp.toNumber()).to.be.within(
        unixTime - 10,
        unixTime + 10
      );
    });

    it("does not allow minting past the breaker", async () => {
      const dest = await getAssociatedTokenAddress(mint, me);
      await program.methods
        .mintV0({
          amount: new BN(50),
        })
        .accounts({
          mint,
          to: dest,
        })
        .rpc({ skipPreflight: true });

        try {
          // Curr supply: 250, agg value: 50... Break threshold at 125
          await program.methods
            .mintV0({
              amount: new BN(80),
            })
            .accounts({
              mint,
              to: dest,
            })
            .rpc({ skipPreflight: true });
          throw new Error("should not get here");
        } catch (e: any) {
          expect(e.toString()).to.include("The circuit breaker was triggered");
        }

      // Wait til the window passes
      await new Promise(resolve => setTimeout(resolve, 10 * 1000));
      await program.methods
        .mintV0({
          amount: new BN(80),
        })
        .accounts({
          mint,
          to: dest,
        })
        .rpc({ skipPreflight: true });
    });
  });

  describe("with account windowed breaker", () => {
    let tokenAccount: PublicKey;
    let mint: PublicKey;
    const accountHolder = Keypair.generate();
    const INITIAL_SUPPLY = 200;

    beforeEach(async () => {
      mint = await createMint(
        provider,
        8,
        me,
        me
      );
      tokenAccount = await createAtaAndMint(provider, mint, new BN(INITIAL_SUPPLY), accountHolder.publicKey);
      const method = await program.methods
        .initializeAccountWindowedBreakerV0({
          authority: me,
          owner: accountHolder.publicKey,
          config: {
            windowSizeSeconds: new BN(10),
            thresholdType: ThresholdType.Percent as never,
            threshold: thresholdPercent(50),
          } as never,
        })
        .signers([accountHolder])
        .accounts({
          tokenAccount,
          owner: accountHolder.publicKey,
        });
      await method.rpc({ skipPreflight: true });
    });

    it("updates the breaker window on mint", async () => {
      const dest = await getAssociatedTokenAddress(mint, me);
      const method = await program.methods
        .transferV0({
          amount: new BN(50),
        })
        .preInstructions([
          createAssociatedTokenAccountInstruction(me, dest, me, mint),
        ])
        .signers([accountHolder])
        .accounts({
          from: tokenAccount,
          to: dest,
          owner: accountHolder.publicKey,
        });
      const circuitBreaker = (await method.pubkeys()).circuitBreaker!;
      await method.rpc();
      const acct = await program.account.accountWindowedCircuitBreakerV0.fetch(
        circuitBreaker
      );

      expect(acct.lastWindow.lastAggregatedValue.toNumber()).to.eq(50);
      const unixTime = new Date().valueOf() / 1000;
      expect(acct.lastWindow.lastUnixTimestamp.toNumber()).to.be.within(
        unixTime - 10,
        unixTime + 10
      );
    });

    it("does not allow minting past the breaker", async () => {
      const dest = await getAssociatedTokenAddress(mint, me);
      await program.methods
        .transferV0({
          amount: new BN(50),
        })
        .preInstructions([
          createAssociatedTokenAccountInstruction(me, dest, me, mint),
        ])
        .signers([accountHolder])
        .accounts({
          from: tokenAccount,
          to: dest,
          owner: accountHolder.publicKey,
        })
        .rpc({ skipPreflight: true });

      try {
        await program.methods
          .transferV0({
            amount: new BN(50),
          })
          .signers([accountHolder])
          .accounts({
            from: tokenAccount,
            to: dest,
            owner: accountHolder.publicKey,
          })
          .rpc({ skipPreflight: true });
        throw new Error("should not get here");
      } catch (e: any) {
        console.error(e)
        expect(e.toString()).to.include("The circuit breaker was triggered");
      }

      // Wait til the window passes
      await new Promise((resolve) => setTimeout(resolve, 10 * 1000));
      await program.methods
        .transferV0({
          amount: new BN(50),
        })
        .signers([accountHolder])
        .accounts({
          from: tokenAccount,
          to: dest,
          owner: accountHolder.publicKey,
        })
        .rpc();
    });
  });
});