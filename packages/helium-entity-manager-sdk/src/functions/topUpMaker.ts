import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { conversionEscrowKey } from "@helium/conversion-escrow-sdk";
import { ConversionEscrow } from "@helium/idls/lib/types/conversion_escrow";
import { HeliumEntityManager } from "@helium/idls/lib/types/helium_entity_manager";
import { MOBILE_MINT, MOBILE_PYTH_PRICE_FEED, TransactionDraft, USDC_MINT, USDC_PYTH_PRICE_FEED, toBN, toNumber } from "@helium/spl-utils";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  PublicKey
} from "@solana/web3.js";
import { deserializeInstruction } from "./utils";

export const JUPITER_URL =
  process.env.JUPITER_URL || "https://quote-api.jup.ag/v6";

export async function topUpMaker({
  program,
  ceProgram,
  maker,
  usdcMint = USDC_MINT,
  payer = (program.provider as AnchorProvider).wallet.publicKey,
}: {
  program: Program<HeliumEntityManager>;
  ceProgram: Program<ConversionEscrow>;
  payer?: PublicKey;
  maker: PublicKey;
  usdcMint?: PublicKey;
}) {
  const makerAcc = await program.account.makerV0.fetch(maker);
  return await Promise.all(makerAcc.topupAmounts.map(async (topupAmount) => {
    const inputMint = USDC_MINT;
    const outputMint = topupAmount.mint

const quoteResponse = await(
  await fetch(
    `${JUPITER_URL}/quote?inputMint=${inputMint.toBase58()}&outputMint=${outputMint.toBase58()}&amount=${toBN(
      topupAmount.sourceAmount,
      6
    ).toString()}&slippageBps=50&onlyDirectRoutes=true`
  )
).json();
if (quoteResponse.error) {
  throw new Error("Failed to get quote: " + quoteResponse.error);
}
const destination = getAssociatedTokenAddressSync(
  inputMint,
  maker,
  true
);
const instructions = await(
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

const conversionEscrow = conversionEscrowKey(usdcMint, maker)[0];
const conversionEscrowAcc = await ceProgram.account.conversionEscrowV0.fetch(conversionEscrow);
const oracle = conversionEscrowAcc.targets.find((t) => t.mint === outputMint)?.oracle;

const {
  computeBudgetInstructions, // The necessary instructions to setup the compute budget.
  swapInstruction: swapInstructionPayload, // The actual swap instruction.
  addressLookupTableAddresses, // The lookup table addresses that you can use if you are using versioned transaction.
} = instructions;

return {
  instructions: [
    await program.methods
      .makerLendV0()
      .accounts({
        maker,
        targetOracle: MOBILE_PYTH_PRICE_FEED,
        conversionEscrow,
        oracle,
        escrow: getAssociatedTokenAddressSync(
          inputMint,
          conversionEscrow,
          true
        ),
        destination: getAssociatedTokenAddressSync(inputMint, payer),
        repayAccount: destination,
        sourceMint: inputMint,
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
  ],
  addressLookupTableAddresses: addressLookupTableAddresses.map(
    (a: any) => new PublicKey(a)
  ),
};
  }));
}
