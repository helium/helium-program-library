import { execute } from "@helium-foundation/spl-utils";
import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { getAccount, getAssociatedTokenAddress } from "@solana/spl-token";
import { expect } from "chai";
import {
  burnDataCreditsInstructions, dataCreditsKey, init, mintDataCreditsInstructions
} from "../packages/data-credits-sdk/src";
import { DataCredits } from "../target/types/data_credits";
import { initTestDataCredits } from "./utils/fixtures";


describe("data-credits", () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  let program: Program<DataCredits>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;

  before(async () => {
    program = await init(
      provider,
      anchor.workspace.DataCredits.programId,
      anchor.workspace.DataCredits.idl
    );
  });

  it("initializes data credits", async () => {
    const { dcKey, dcMint, hntMint } = await initTestDataCredits(
      program,
      provider
    );

    const dataCreditsAcc = await program.account.dataCreditsV0.fetch(dcKey);
    const [dc, dcBump] = dataCreditsKey();

    expect(dataCreditsAcc?.dcMint.toBase58()).eq(dcMint.toBase58());
    expect(dataCreditsAcc?.hntMint.toBase58()).eq(hntMint.toBase58());
    expect(dataCreditsAcc?.authority.toBase58()).eq(me.toBase58());
    expect(dataCreditsAcc?.dataCreditsBump).eq(dcBump);
  });

  describe("with data credits", async () => {
    it("mints some data credits", async () => {
      const {
        dcMint,
        dcBal: previousDcBal,
        hntMint,
        hntBal: previousHntBal,
      } = await initTestDataCredits(program, provider);

      const ix = await mintDataCreditsInstructions({
        program,
        provider,
        amount: 1,
      });
      await execute(program, provider, ix);

      const dcAta = await getAssociatedTokenAddress(dcMint, me);
      const dcAtaAcc = await getAccount(provider.connection, dcAta);

      expect(dcAtaAcc.isFrozen);

      const dcBal = await provider.connection.getTokenAccountBalance(dcAta);
      const hntBal = await provider.connection.getTokenAccountBalance(
        await getAssociatedTokenAddress(hntMint, me)
      );

      expect(dcBal.value.uiAmount).eq(previousDcBal + 1);
      expect(hntBal.value.uiAmount).eq(previousHntBal - 1);
    });

    it("burns some data credits", async () => {
      const { dcMint, dcBal: previousDcBal } = await initTestDataCredits(
        program,
        provider
      );

      const ix = await burnDataCreditsInstructions({
        program,
        provider,
        amount: 1,
      });
      await execute(program, provider, ix);

      const dcAta = await getAssociatedTokenAddress(dcMint, me);
      const dcAtaAcc = await getAccount(provider.connection, dcAta);

      expect(dcAtaAcc.isFrozen);
      const dcBal = await provider.connection.getTokenAccountBalance(dcAta);
      expect(dcBal.value.uiAmount).eq(previousDcBal - 1);
    });
  });
});
