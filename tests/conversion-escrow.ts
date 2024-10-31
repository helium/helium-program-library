import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { createAtaAndMint, createMint, sendInstructions, toBN, toNumber } from "@helium/spl-utils";
import {
  PythSolanaReceiverProgram,
  pythSolanaReceiverIdl,
} from "@pythnetwork/pyth-solana-receiver";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync
} from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import { init } from "../packages/conversion-escrow-sdk/src";
import { PROGRAM_ID } from "../packages/conversion-escrow-sdk/src/constants";
import { ConversionEscrow } from "../target/types/conversion_escrow";
import { ensureConversionEscrowIdl as ensureConversionEscrowIdl } from "./utils/fixtures";

describe("conversion-escrow", () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  const mobileOracle = new PublicKey(
    "DQ4C1tzvu28cwo1roN1Wm6TW35sfJEjLh517k3ZeWevx"
  );
  const hntOracle = new PublicKey(
    "4DdmDswskDxXGpwHrXUfn2CNUm9rt21ac79GHNTN3J33"
  );
  let program: Program<ConversionEscrow>;
  let pythProgram: Program<PythSolanaReceiverProgram>;
  let mobileMint: PublicKey;
  let hntMint: PublicKey;
  let startHntBal = 10000;
  let startMobileEscrowBal = 100000000;
  let hntDecimals = 8;
  let mobileDecimals = 6;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;
  const hntHolder = Keypair.generate();

  beforeEach(async () => {
    pythProgram = new Program(
      pythSolanaReceiverIdl,
      new PublicKey("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ")
    );
    program = await init(
      provider,
      PROGRAM_ID,
      anchor.workspace.ConversionEscrow.idl
    )
    // fresh start
    mobileMint = await createMint(provider, mobileDecimals, me, me);
    hntMint = await createMint(provider, hntDecimals, me, me);
    await createAtaAndMint(
      provider,
      hntMint,
      toBN(startHntBal, hntDecimals).toNumber(),
      hntHolder.publicKey
    );
  });

  describe("with data credits and escrow", async () => {
    let conversionEscrow: PublicKey | undefined;

    beforeEach(async () => {
      await ensureConversionEscrowIdl(program);

      ({
        pubkeys: { conversionEscrow },
      } = await program.methods
        .initializeEscrowV0({
          oracle: mobileOracle,
          // Slippage can be super low since price isn't changing.
          targets: [
            {
              mint: hntMint,
              slippageBps: 1,
              oracle: hntOracle,
            },
          ],
        })
        .accounts({
          owner: me,
          payer: me,
          mint: mobileMint,
          updateAuthority: me
        })
        .rpcAndKeys({ skipPreflight: true }));

      // Populate the escrow
      await createAtaAndMint(
        provider,
        mobileMint,
        toBN(startMobileEscrowBal, mobileDecimals).toNumber(),
        conversionEscrow
      );
    });

    it("lends MOBILE in exchange for HNT", async () => {
      // Lend enough MOBILE to `hntHolder` to get 40000 DC. HNT holder
      // will then burn enough HNT to get that DC into `owner`
      console.log("fetching mobile price")
      const priceMobile = await pythProgram.account.priceUpdateV2.fetch(
        mobileOracle
      );

      const mobileFloorValue =
        priceMobile.priceMessage.emaPrice
          .sub(priceMobile.priceMessage.emaConf.mul(new anchor.BN(2)))
          .toNumber() *
        10 ** priceMobile.priceMessage.exponent *
        10 ** 6;

      console.log("fetching hnt price");
      const priceHnt = await pythProgram.account.priceUpdateV2.fetch(hntOracle);

      const hntFloorValue =
        priceHnt.priceMessage.emaPrice
            .sub(priceMobile.priceMessage.emaConf.mul(new anchor.BN(2)))
          .toNumber() *
        10 ** priceHnt.priceMessage.exponent *
        10 ** 8;
      const hntPerMobile = mobileFloorValue / hntFloorValue

      const hntHolderMobileAta = getAssociatedTokenAddressSync(
        mobileMint,
        hntHolder.publicKey
      );
      const hntHolderHntAta = getAssociatedTokenAddressSync(
        hntMint,
        hntHolder.publicKey
      );
      const mobileAmount = new anchor.BN(5000)
      const instructions = [
        createAssociatedTokenAccountIdempotentInstruction(
          me,
          hntHolderMobileAta,
          hntHolder.publicKey,
          mobileMint
        ),
        createAssociatedTokenAccountIdempotentInstruction(
          me,
          getAssociatedTokenAddressSync(hntMint, me),
          me,
          hntMint
        ),
        await program.methods
          .lendV0({
            // Goal: get 5000 MOBILE worth of HNT
            amount: mobileAmount,
          })
          .accounts({
            conversionEscrow,
            destination: hntHolderMobileAta,
            targetOracle: hntOracle,
            repayAccount: getAssociatedTokenAddressSync(hntMint, me),
          })
          .instruction(),
        createTransferInstruction(
          hntHolderHntAta,
          getAssociatedTokenAddressSync(hntMint, me),
          hntHolder.publicKey,
          BigInt(toBN(hntPerMobile * 5000, 8).toString())
        ),
        await program.methods
          .checkRepayV0()
          .accounts({
            conversionEscrow,
            repayAccount: getAssociatedTokenAddressSync(hntMint, me),
          })
          .instruction(),
      ];

      await sendInstructions(provider, instructions, [hntHolder]);

      const hntAta = await getAssociatedTokenAddressSync(
        hntMint,
        hntHolder.publicKey
      );
      const mobileAta = await getAssociatedTokenAddressSync(
        mobileMint,
        conversionEscrow!,
        true
      );
      const mobileBal = await provider.connection.getTokenAccountBalance(
        mobileAta
      );
      const hntBal = await provider.connection.getTokenAccountBalance(hntAta);
      expect(mobileBal.value.uiAmount).to.eq(
        // Ensure matching decimals amounts
        toNumber(
          toBN(
            startMobileEscrowBal - toNumber(mobileAmount, mobileDecimals),
            mobileDecimals
          ),
          mobileDecimals
        )
      );
      expect(hntBal.value.uiAmount).to.eq(
        // Ensure matching decimals amounts
        toNumber(
          toBN(startHntBal - 5000 * hntPerMobile, hntDecimals),
          hntDecimals
        )
      );
    });
  });
});
