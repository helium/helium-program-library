import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { assert } from "chai";
import { init, dataCreditsKey, tokenAuthorityKey, mintDataCreditsInstructions, burnDataCreditsInstructions, isInitialized } from "../packages/data-credits-sdk/src";
import { DataCredits } from "../target/types/data_credits";
import { createAtaAndMint, createMint, mintTo } from "./utils/token";
import {
  getAssociatedTokenAddress,
  getAccount,
  getMint,
} from "@solana/spl-token";
import { toBN, execute } from "@helium-foundation/spl-utils";
import { PROGRAM_ID } from "../packages/data-credits-sdk/src/constants";

describe("data-credits", () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  let program: Program<DataCredits>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;

  let hntMint: PublicKey;
  let dcMint: PublicKey;
  const hntDecimals = 8;
  const dcDecimals = 8;
  let startHntBal = 100;
  let startDcBal = 0;
  let dcKey: PublicKey;
  before(async () => {
    program = await init(provider, PROGRAM_ID, anchor.workspace.DataCredits.idl);
    dcKey = dataCreditsKey()[0];
    if (await isInitialized(program)) {
      // accounts for rerunning tests on same localnet
      const dcAcc = await program.account.dataCreditsV0.fetch(dcKey);
      hntMint = dcAcc.hntMint;
      dcMint = dcAcc.dcMint;
      startHntBal = (await provider.connection.getTokenAccountBalance(await getAssociatedTokenAddress(hntMint, me))).value.uiAmount!;
      if (await provider.connection.getAccountInfo(await getAssociatedTokenAddress(dcMint, me))) {
        startDcBal = (await provider.connection.getTokenAccountBalance(await getAssociatedTokenAddress(dcMint, me))).value.uiAmount!;
      }
    } else {
      // fresh start
      const [tokenAuth] = tokenAuthorityKey();
      hntMint = await createMint(provider, hntDecimals, me, me);
      dcMint = await createMint(provider, dcDecimals, tokenAuth, tokenAuth);
      await createAtaAndMint(provider, hntMint, toBN(startHntBal, hntDecimals).toNumber(), me);
      await program.methods.initializeDataCreditsV0({authority: me}).accounts({hntMint, dcMint, payer: me}).rpc();
    }
  });

  it("initializes data credits", async () => {
    const dataCreditsAcc = await program.account.dataCreditsV0.fetch(dcKey);
    const [tokenAuth, tokenAuthBump] = tokenAuthorityKey();

    assert(dataCreditsAcc?.dcMint.equals(dcMint));
    assert(dataCreditsAcc?.hntMint.equals(hntMint));
    assert(dataCreditsAcc?.authority.equals(me));
    assert(dataCreditsAcc?.tokenAuthority.equals(tokenAuth));
    assert(dataCreditsAcc?.tokenAuthorityBump == tokenAuthBump);
  });

  describe("with data credits", async() => {
    it("mints some data credits", async () => {
      const ix = await mintDataCreditsInstructions({
        program,
        provider,
        amount: 1,
      });
      await execute(program, provider, ix);

      const dcAta = await getAssociatedTokenAddress(dcMint, me);
      const dcAtaAcc = await getAccount(provider.connection, dcAta);

      assert(dcAtaAcc.isFrozen);
      const dcBal = await provider.connection.getTokenAccountBalance(dcAta);
      const hntBal = await provider.connection.getTokenAccountBalance(await getAssociatedTokenAddress(hntMint, me));
      assert(dcBal.value.uiAmount == startDcBal + 1);
      assert(hntBal.value.uiAmount == startHntBal - 1);      
    })

    it("burns some data credits", async() => {
      const ix = await burnDataCreditsInstructions({
        program,
        provider,
        amount: 1,
      });
      await execute(program, provider, ix);

      const dcAta = await getAssociatedTokenAddress(dcMint, me);
      const dcAtaAcc = await getAccount(provider.connection, dcAta);

      assert(dcAtaAcc.isFrozen);
      const dcBal = await provider.connection.getTokenAccountBalance(dcAta);
      assert(dcBal.value.uiAmount == startDcBal);
    })
  })
});
