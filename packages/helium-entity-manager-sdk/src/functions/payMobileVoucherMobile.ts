import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { conversionEscrowKey } from "@helium/conversion-escrow-sdk";
import { ConversionEscrow } from "@helium/idls/lib/types/conversion_escrow";
import { HeliumEntityManager } from "@helium/idls/lib/types/helium_entity_manager";
import { MOBILE_MINT, MOBILE_PYTH_PRICE_FEED, USDC_MINT, USDC_PYTH_PRICE_FEED, toBN, toNumber } from "@helium/spl-utils";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  PublicKey
} from "@solana/web3.js";
import { deserializeInstruction } from "./utils";

export const JUPITER_URL =
  process.env.JUPITER_URL || "https://quote-api.jup.ag/v6";

export async function payMobileVoucherMobile({
  program,
  ceProgram,
  mobileHotspotVoucher,
  verifiedOwner,
  maker,
  payer = (program.provider as AnchorProvider).wallet.publicKey,
}: {
  program: Program<HeliumEntityManager>;
  ceProgram: Program<ConversionEscrow>;
  mobileHotspotVoucher: PublicKey;
  verifiedOwner?: PublicKey;
  payer?: PublicKey;
  maker?: PublicKey;
}) {
  const voucher = await program.account.mobileHotspotVoucherV0.fetch(
    mobileHotspotVoucher
  );
  const rewardableEntityConfigAcc =
    await program.account.rewardableEntityConfigV0.fetch(
      voucher.rewardableEntityConfig
    );
  const deviceType = voucher.deviceType;
  const fees =
    rewardableEntityConfigAcc.settings.mobileConfigV2?.feesByDevice.find(
      (d) => Object.keys(d.deviceType)[0] === Object.keys(deviceType)[0]
    )!;
  const mobileFeeUsd = toNumber(fees.mobileOnboardingFeeUsd, 6);

  const quoteResponse = await (
    await fetch(
      `${JUPITER_URL}/quote?inputMint=${USDC_MINT.toBase58()}&outputMint=${MOBILE_MINT.toBase58()}&amount=${toBN(
        mobileFeeUsd,
        6
      ).toString()}&slippageBps=50&onlyDirectRoutes=true`
    )
  ).json();
  if (quoteResponse.error) {
    throw new Error("Failed to get quote: " + quoteResponse.error);
  }
  const destination = getAssociatedTokenAddressSync(
          MOBILE_MINT,
          voucher.maker,
          true
        )
  const instructions = await (
    await fetch(`${JUPITER_URL}/swap-instructions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // quoteResponse from /quote api
        quoteResponse,
        userPublicKey: payer,
        destinationTokenAccount: destination,
      }),
    })
  ).json();
  if (instructions.error) {
    throw new Error("Failed to get swap instructions: " + instructions.error);
  }

  const conversionEscrow = conversionEscrowKey(USDC_MINT, voucher.maker)[0]

  const {
    computeBudgetInstructions, // The necessary instructions to setup the compute budget.
    swapInstruction: swapInstructionPayload, // The actual swap instruction.
    addressLookupTableAddresses, // The lookup table addresses that you can use if you are using versioned transaction.
  } = instructions;

  return {
    instructions: [
      await program.methods
        .makerLendV0({
          amount: toBN(mobileFeeUsd, 6),
        })
        .accounts({
          maker: voucher.maker,
          targetOracle: MOBILE_PYTH_PRICE_FEED,
          conversionEscrow,
          oracle: USDC_PYTH_PRICE_FEED,
          escrow: getAssociatedTokenAddressSync(
            USDC_MINT,
            conversionEscrow,
            true
          ),
          destination: getAssociatedTokenAddressSync(USDC_MINT, payer),
          repayAccount: destination,
          usdcMint: USDC_MINT,
        })
        .instruction(),
      ...computeBudgetInstructions.map(deserializeInstruction),
      deserializeInstruction(swapInstructionPayload),
      await ceProgram.methods
        .checkRepayV0()
        .accounts({
          conversionEscrow,
          repayAccount: destination,
        })
        .instruction(),
      await program.methods
        .mobileVoucherPayMobileV0()
        .accounts({
          verifiedOwner,
          mobileHotspotVoucher,
          dntPrice: MOBILE_PYTH_PRICE_FEED,
          maker,
        })
        .instruction(),
    ],
    addressLookupTableAddresses: addressLookupTableAddresses.map(
      (a: any) => new PublicKey(a)
    ),
  };
}
