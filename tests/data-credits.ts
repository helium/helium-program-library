import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { assert } from "chai";
import { init, dataCreditsKey, mintDataCreditsInstructions, burnDataCreditsInstructions, isInitialized, accountPayerKey } from "../packages/data-credits-sdk/src";
import * as hsd from "../packages/helium-sub-daos-sdk/src";
import { DataCredits } from "../target/types/data_credits";
import { createAtaAndMint, createMint, mintTo } from "./utils/token";
import {
  getAssociatedTokenAddress,
  getAccount,
  getMint,
} from "@solana/spl-token";
import { toBN, toNumber, execute } from "../packages/spl-utils/src";
import { PROGRAM_ID } from "../packages/data-credits-sdk/src/constants";
import { initTestDao, initTestSubdao } from "./utils/daos";
import { HeliumSubDaos } from "../target/types/helium_sub_daos";
import * as web3 from "@solana/web3.js";

const EPOCH_REWARDS = 100000000;

describe("data-credits", () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  let program: Program<DataCredits>;
  let hsdProgram: Program<HeliumSubDaos>;
  let dcKey: PublicKey;
  let hntMint: PublicKey;
  let dcMint: PublicKey;
  let startHntBal = 0;
  let startDcBal = 0;
  let hntDecimals = 8;
  let dcDecimals = 8;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;

  before(async () => {
    console.log(anchor.workspace.DataCredits.idl);
    program = await init(
      provider,
      PROGRAM_ID,
      anchor.workspace.DataCredits.idl
    );
    hsdProgram = await hsd.init(
      provider,
      hsd.PROGRAM_ID,
      anchor.workspace.HeliumSubDaos.idl
    );
    dcKey = dataCreditsKey()[0];
    if (await isInitialized(program)) {
      // accounts for rerunning tests on same localnet
      const dcAcc = await program.account.dataCreditsV0.fetch(dcKey);
      hntMint = dcAcc.hntMint;
      dcMint = dcAcc.dcMint;
      startHntBal = (
        await provider.connection.getTokenAccountBalance(
          await getAssociatedTokenAddress(hntMint, me)
        )
      ).value.uiAmount!;
      if (
        await provider.connection.getAccountInfo(
          await getAssociatedTokenAddress(dcMint, me)
        )
      ) {
        startDcBal = (
          await provider.connection.getTokenAccountBalance(
            await getAssociatedTokenAddress(dcMint, me)
          )
        ).value.uiAmount!;
      }
    } else {
      // fresh start
      hntMint = await createMint(provider, hntDecimals, me, me);
      dcMint = await createMint(provider, dcDecimals, dcKey, dcKey);
      await createAtaAndMint(
        provider,
        hntMint,
        toBN(startHntBal, hntDecimals).toNumber(),
        me
      );
      await program.methods
        .initializeDataCreditsV0({ authority: me })
        .accounts({ hntMint, dcMint, payer: me })
        .rpc();
    }
  });

  it("initializes data credits", async () => {
    const dataCreditsAcc = await program.account.dataCreditsV0.fetch(dcKey);
    const [_, dcBump] = dataCreditsKey();
    assert(dataCreditsAcc?.dcMint.equals(dcMint));
    assert(dataCreditsAcc?.hntMint.equals(hntMint));
    assert(dataCreditsAcc?.authority.equals(me));
    assert(dataCreditsAcc?.dataCreditsBump == dcBump);
  });

  describe("with data credits", async () => {
    let dao: PublicKey;
    let subDao: PublicKey;
    before(async () => {
      ({ dao } = await initTestDao(hsdProgram, provider, EPOCH_REWARDS, me));
      ({ subDao } = await initTestSubdao(hsdProgram, provider, me, dao));
    });
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
      const hntBal = await provider.connection.getTokenAccountBalance(
        await getAssociatedTokenAddress(hntMint, me)
      );
      assert(dcBal.value.uiAmount == startDcBal + 1);
      assert(hntBal.value.uiAmount == startHntBal - 1);
    });

    it("burns some data credits", async () => {
      await provider.connection.requestAirdrop(
        accountPayerKey()[0],
        web3.LAMPORTS_PER_SOL
      );
      const ix = await burnDataCreditsInstructions({
        program,
        provider,
        amount: 1,
        subDao,
      });
      await execute(program, provider, ix);

      const dcAta = await getAssociatedTokenAddress(dcMint, me);
      const dcAtaAcc = await getAccount(provider.connection, dcAta);

      assert(dcAtaAcc.isFrozen);
      const dcBal = await provider.connection.getTokenAccountBalance(dcAta);
      assert(dcBal.value.uiAmount == startDcBal);

      // check that epoch info was tracked correctly
      const epochInfo = await hsdProgram.account.subDaoEpochInfoV0.fetch(
        ix.output.subDaoEpochInfo
      );
      const numBurned = toNumber(epochInfo.dcBurned, dcDecimals);
      assert.equal(numBurned, 1);
    });
  });
});