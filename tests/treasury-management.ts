import { createAtaAndMint, createMint } from "@helium/spl-utils";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AccountLayout, getAssociatedTokenAddress } from "@solana/spl-token";
import { ComputeBudgetProgram, Keypair, PublicKey } from "@solana/web3.js";
import { BN } from "bn.js";
import { expect } from "chai";
import {
  ThresholdType
} from "../packages/circuit-breaker-sdk/src";
import {
  init,
  PROGRAM_ID,
  toU128
} from "../packages/treasury-management-sdk/src";
import { TreasuryManagement } from "../target/types/treasury_management";

describe("treasury-management", () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;

  let program: Program<TreasuryManagement>;
  beforeEach(async () => {
    program = await init(
      provider,
      PROGRAM_ID,
      anchor.workspace.TreasuryManagement.idl
    );
  });

  it("initializes treasury management", async () => {
    const treasuryMint = await createMint(provider, 2, me, me);
    const supplyMint = await createMint(provider, 2, me, me);
    const method = await program.methods
      .initializeTreasuryManagementV0({
        authority: me,
        curve: {
          exponentialCurveV0: {
            k: toU128(2),
          },
        } as any,
        freezeUnixTime: new BN(100000000000),
        windowConfig: {
          windowSizeSeconds: new BN(10),
          thresholdType: ThresholdType.Absolute as never,
          threshold: new BN(1000000000),
        },
      })
      .accounts({
        treasuryMint,
        supplyMint,
      });

    await method.rpc({ skipPreflight: true });
    
    const pubkeys = await method.pubkeys();
    const treasuryManagement = pubkeys.treasuryManagement;

    const treasuryManagementAcc = await program.account.treasuryManagementV0.fetch(treasuryManagement!);

    expect(treasuryManagementAcc.authority.toBase58()).to.eq(me.toBase58());
    expect(treasuryManagementAcc.freezeUnixTime.toNumber()).to.eq(100000000000);
  })

  describe("with treasury management", () => {
    let treasuryMint: PublicKey;
    let supplyMint: PublicKey;
    let treasuryManagement: PublicKey;

    beforeEach(async () => {
      treasuryMint = await createMint(provider, 2, me, me);
      supplyMint = await createMint(provider, 2, me, me);
      await createAtaAndMint(provider, supplyMint, 10000);
      const method = await program.methods
        .initializeTreasuryManagementV0({
          authority: me,
          curve: {
            exponentialCurveV0: {
              k: toU128(2),
            },
          } as any,
          freezeUnixTime: new BN(100000000000),
          windowConfig: {
            windowSizeSeconds: new BN(10),
            thresholdType: ThresholdType.Absolute as never,
            threshold: new BN(1000000000),
          },
        })
        .accounts({
          treasuryMint,
          supplyMint,
        });

      await method.rpc({ skipPreflight: true });
      const pubkeys = await method.pubkeys();
      await createAtaAndMint(provider, treasuryMint, new BN(10000), pubkeys.treasuryManagement);
      treasuryManagement = pubkeys.treasuryManagement!;
    });

    it("allows updating treasury management", async () => {
      const newAuth = Keypair.generate();
      await program.methods
        .updateTreasuryManagementV0({
          authority: newAuth.publicKey,
          freezeUnixTime: new BN(10),
          curve: {
            exponentialCurveV0: {
              k: toU128(5),
            },
          } as any,
        })
        .accounts({
          treasuryManagement,
        })
        .rpc({ skipPreflight: true });

      const treasuryManagementAcc =
        await program.account.treasuryManagementV0.fetch(treasuryManagement!);

      expect(treasuryManagementAcc.authority.toBase58()).to.eq(newAuth.publicKey.toBase58());
      expect(treasuryManagementAcc.freezeUnixTime.toNumber()).to.eq(10);
      // @ts-ignore
      expect(treasuryManagementAcc.curve.exponentialCurveV0.k.toNumber()).to.eq(
        5000000000000
      );
    })

    it ("allows redemption", async () => {
      // dR = (R / S^(1 + k)) ((S + dS)^(1 + k) - S^(1 + k))
      // 100 / (100 ^ (1 + 2)) ((100 - 50)^(1+2) - 100^(1 + 2))
      // 100 / 100^3 (50^3 - 100^3)

      const outputAmtRaw = Math.pow(100, -2) * (Math.pow(50, 3) - Math.pow(100, 3)) * 100; 
      const outputAmt = Math.floor(Math.abs(outputAmtRaw));

      // Ensure ata exists
      await createAtaAndMint(provider, treasuryMint, 0);
      await program.methods
        .redeemV0({
          amount: new BN(5000), // 50.00
          expectedOutputAmount: new BN(outputAmt),
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 350000 }),
        ])
        .accounts({
          treasuryManagement,
        })
        .rpc({ skipPreflight: true });

      const balance = AccountLayout.decode(
        (
          await provider.connection.getAccountInfo(
            await getAssociatedTokenAddress(supplyMint, me)
          )
        )?.data!
      ).amount;
      const treasBalance = AccountLayout.decode(
        (
          await provider.connection.getAccountInfo(
            await getAssociatedTokenAddress(treasuryMint, me)
          )
        )?.data!
      ).amount;
      expect(Number(balance)).to.eq(5000);
      expect(Number(treasBalance)).to.eq(outputAmt);
    })
  })
})
