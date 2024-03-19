import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { VoterStakeRegistry } from "@helium/idls/lib/types/voter_stake_registry";
import { createAtaAndMint, createMint, sendInstructions } from "@helium/spl-utils";
import { parsePriceData } from "@pythnetwork/client";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync
} from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { expect } from "chai";
import { ThresholdType } from "../packages/circuit-breaker-sdk/src";
import {
  dataCreditsKey,
  init as initDc
} from "../packages/data-credits-sdk/src";
import { PROGRAM_ID as DC_PROGRAM_ID } from "../packages/data-credits-sdk/src/constants";
import { init } from "../packages/dc-conversion-escrow-sdk/src";
import { PROGRAM_ID } from "../packages/dc-conversion-escrow-sdk/src/constants";
import * as hsd from "../packages/helium-sub-daos-sdk/src";
import { daoKey } from "../packages/helium-sub-daos-sdk/src";
import { toBN, toNumber } from "../packages/spl-utils/src";
import * as vsr from "../packages/voter-stake-registry-sdk/src";
import { DataCredits } from "../target/types/data_credits";
import { DcConversionEscrow } from "../target/types/dc_conversion_escrow";
import { HeliumSubDaos } from "../target/types/helium_sub_daos";
import { ensureDCIdl, ensureDcEscrowIdl, ensureHSDIdl, ensureVSRIdl } from "./utils/fixtures";
import { initVsr } from "./utils/vsr";

const EPOCH_REWARDS = 100000000;

describe("dc-conversion-escrow", () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  const mobileOracle = new PublicKey("JBaTytFv1CmGNkyNiLu16jFMXNZ49BGfy4bYAYZdkxg5")
  const hntOracle = new PublicKey("7moA1i5vQUpfDwSpK6Pw9s56ahB7WFGidtbL2ujWrVvm")
  let program: Program<DcConversionEscrow>;
  let dcProgram: Program<DataCredits>;
  let hsdProgram: Program<HeliumSubDaos>;
  let vsrProgram: Program<VoterStakeRegistry>;
  let dcKey: PublicKey;
  let mobileMint: PublicKey;
  let hntMint: PublicKey;
  let dcMint: PublicKey;
  let startHntBal = 10000;
  let startMobileEscrowBal = 100000000;
  let hntDecimals = 8;
  let mobileDecimals = 6;
  let dcDecimals = 0;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;
  const hntHolder = Keypair.generate();

  beforeEach(async () => {
    program = await init(
      provider,
      PROGRAM_ID,
      anchor.workspace.DcConversionEscrow.idl
    )
    dcProgram = await initDc(
      provider,
      DC_PROGRAM_ID,
      anchor.workspace.DataCredits.idl
    );
    hsdProgram = await hsd.init(
      provider,
      hsd.PROGRAM_ID,
      anchor.workspace.HeliumSubDaos.idl
    );
    vsrProgram = await vsr.init(
      provider,
      vsr.PROGRAM_ID,
      anchor.workspace.VoterStakeRegistry.idl
    );
    await ensureVSRIdl(vsrProgram);
    // fresh start
    mobileMint = await createMint(provider, mobileDecimals, me, me);
    hntMint = await createMint(provider, hntDecimals, me, me);
    dcMint = await createMint(provider, dcDecimals, me, me);
    await createAtaAndMint(
      provider,
      hntMint,
      toBN(startHntBal, hntDecimals).toNumber(),
      hntHolder.publicKey
    );

    const method = await dcProgram.methods
      .initializeDataCreditsV0({
        authority: me,
        config: {
          windowSizeSeconds: new BN(60),
          thresholdType: ThresholdType.Absolute as never,
          threshold: new BN("10000000000000000000"),
        },
      })
      .accounts({
        hntMint,
        dcMint,
        payer: me,
        hntPriceOracle: new PublicKey(
          "7moA1i5vQUpfDwSpK6Pw9s56ahB7WFGidtbL2ujWrVvm"
        ),
      });
    dcKey = (await method.pubkeys()).dataCredits!;
    await method.rpc({
      skipPreflight: true,
    });
  });

  describe("with data credits and escrow", async () => {
    let dao: PublicKey;
    let conversionEscrow: PublicKey | undefined;

    beforeEach(async () => {
      const registrar = (
        await initVsr(
          vsrProgram,
          provider,
          provider.wallet.publicKey,
          hntMint,
          daoKey(hntMint)[0]
        )
      ).registrar;
      const method = await hsdProgram.methods
        .initializeDaoV0({
          authority: me,
          registrar,
          netEmissionsCap: toBN(34.24, 8),
          hstEmissionSchedule: [
            {
              startUnixTime: new anchor.BN(0),
              percent: 32,
            },
          ],
          emissionSchedule: [
            {
              startUnixTime: new anchor.BN(0),
              emissionsPerEpoch: new BN(EPOCH_REWARDS),
            },
          ],
        })
        .preInstructions([
          createAssociatedTokenAccountIdempotentInstruction(
            me,
            getAssociatedTokenAddressSync(hntMint, me),
            me,
            hntMint
          ),
        ])
        .accounts({
          dcMint,
          hntMint,
          hstPool: getAssociatedTokenAddressSync(hntMint, me),
        });
      await ensureHSDIdl(hsdProgram);
      await ensureDcEscrowIdl(program);
      await ensureDCIdl(dcProgram);

      dao = (await method.pubkeys()).dao!;
      if (!(await provider.connection.getAccountInfo(dao))) {
        await method.rpc({ skipPreflight: true });
      }
      console.log("start");

      ({
        pubkeys: { conversionEscrow },
      } = await program.methods
        .initializeEscrowV0({
          // Slippage can be super low since price isn't changing.
          slippageBps: 1,
        })
        .accounts({
          owner: me,
          payer: me,
          mint: mobileMint,
          oracle: mobileOracle,
          dataCredits: dataCreditsKey(dcMint)[0],
        })
        .rpcAndKeys({ skipPreflight: true }));
      console.log("done");

      // Populate the escrow
      await createAtaAndMint(
        provider,
        mobileMint,
        toBN(startMobileEscrowBal, mobileDecimals).toNumber(),
        conversionEscrow
      );
    });

    it("lends MOBILE to mint DC to owner", async () => {
      // Lend enough MOBILE to `hntHolder` to get 40000 DC. HNT holder
      // will then burn enough HNT to get that DC into `owner`
      const pythDataMobile = (await provider.connection.getAccountInfo(
        mobileOracle
      ))!.data;
      const priceMobile = parsePriceData(pythDataMobile);

      const mobileFloorValueInDc = Math.floor(
        (priceMobile.emaPrice.value - priceMobile.emaConfidence!.value * 2) *
          10 ** 5
      );

      const pythData = (await provider.connection.getAccountInfo(hntOracle))!
        .data;
      const priceHnt = parsePriceData(pythData);

      const hntFloorValueInDc = Math.floor(
        (priceHnt.emaPrice.value - priceHnt.emaConfidence!.value * 2) * 10 ** 5
      );

      const hntHolderMobileAta = getAssociatedTokenAddressSync(
        mobileMint,
        hntHolder.publicKey
      );
      const mobileAmount = toBN(40000 / mobileFloorValueInDc, mobileDecimals);

      const instructions = [
        createAssociatedTokenAccountIdempotentInstruction(
          me,
          hntHolderMobileAta,
          hntHolder.publicKey,
          mobileMint
        ),
        createAssociatedTokenAccountIdempotentInstruction(
          me,
          getAssociatedTokenAddressSync(dcMint, me),
          me,
          dcMint
        ),
        await program.methods
          .lendV0({
            // Goal: get 4000 DC
            amount: mobileAmount,
          })
          .accounts({
            conversionEscrow,
            destination: hntHolderMobileAta,
          })
          .instruction(),
        await dcProgram.methods
          .mintDataCreditsV0({
            hntAmount: toBN(40000 / hntFloorValueInDc, 8),
            dcAmount: null,
          })
          .accounts({
            dcMint,
            owner: hntHolder.publicKey,
            recipient: me,
          })
          .instruction(),
      ];

      await sendInstructions(provider, instructions, [hntHolder]);

      const dcAta = await getAssociatedTokenAddressSync(dcMint, me);
      const hntAta = await getAssociatedTokenAddressSync(
        hntMint,
        hntHolder.publicKey
      );
      const mobileAta = await getAssociatedTokenAddressSync(
        mobileMint,
        conversionEscrow!,
        true
      );
      const dcBal = await provider.connection.getTokenAccountBalance(dcAta);
      const mobileBal = await provider.connection.getTokenAccountBalance(
        mobileAta
      );
      const hntBal = await provider.connection.getTokenAccountBalance(hntAta);
      expect(dcBal.value.uiAmount).to.eq(40000);
      console.log("bal", mobileBal.value.uiAmount);
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
          toBN(startHntBal - 40000 / hntFloorValueInDc, hntDecimals),
          hntDecimals
        )
      );
    });
  });
});
