import { Keypair as HeliumKeypair } from "@helium/crypto";
import { createAtaAndMint, createMint } from "@helium/spl-utils";
import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { parsePriceData } from "@pythnetwork/client";
import {
  createAssociatedTokenAccountIdempotentInstruction, getAccount,
  getAssociatedTokenAddress
} from "@solana/spl-token";
import * as web3 from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { assert, expect } from "chai";
import {
  accountPayerKey,
  dataCreditsKey,
  init
} from "../packages/data-credits-sdk/src";
import { PROGRAM_ID } from "../packages/data-credits-sdk/src/constants";
import * as hsd from "../packages/helium-sub-daos-sdk/src";
import { HNT_PYTH_PRICE_FEED, toBN, toNumber } from "../packages/spl-utils/src";
import * as vsr from "../packages/voter-stake-registry-sdk/src";
import { DataCredits } from "../target/types/data_credits";
import { HeliumSubDaos } from "../target/types/helium_sub_daos";
import { initTestSubdao } from "./utils/daos";
import { ensureHSDIdl, ensureVSRIdl } from "./utils/fixtures";

import { VoterStakeRegistry } from "@helium/idls/lib/types/voter_stake_registry";
import { ThresholdType } from "../packages/circuit-breaker-sdk/src";
import { daoKey } from "../packages/helium-sub-daos-sdk/src";
import { initVsr } from "./utils/vsr";
const EPOCH_REWARDS = 100000000;

export async function burnDataCredits({
  amount,
  program,
  subDao,
}: {
  program: Program<DataCredits>;
  amount: number;
  subDao: PublicKey;
}): Promise<{ subDaoEpochInfo: PublicKey }> {
  const useData = await program.methods
    .delegateDataCreditsV0({
      amount: toBN(amount, 0),
      routerKey: (await HeliumKeypair.makeRandom()).address.b58,
    })
    .accounts({
      subDao,
    });
  const delegatedDataCredits = (await useData.pubkeys()).delegatedDataCredits!;
  await useData.rpc({ skipPreflight: true });
  const burn = program.methods
    .burnDelegatedDataCreditsV0({
      amount: toBN(amount, 0),
    })
    .accounts({
      delegatedDataCredits,
    });

  await burn.rpc({ skipPreflight: true });

  return {
    subDaoEpochInfo: (await burn.pubkeys()).subDaoEpochInfo!,
  };
}

describe("data-credits", () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  let program: Program<DataCredits>;
  let hsdProgram: Program<HeliumSubDaos>;
  let vsrProgram: Program<VoterStakeRegistry>;
  let dcKey: PublicKey;
  let hntMint: PublicKey;
  let dcMint: PublicKey;
  let startHntBal = 10000;
  let startDcBal = 2;
  let hntDecimals = 8;
  let dcDecimals = 0;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;

  beforeEach(async () => {
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
    vsrProgram = await vsr.init(
      provider,
      vsr.PROGRAM_ID,
      anchor.workspace.VoterStakeRegistry.idl
    );
    ensureVSRIdl(vsrProgram);
    // fresh start
    hntMint = await createMint(provider, hntDecimals, me, me);
    dcMint = await createMint(provider, dcDecimals, me, me);
    await createAtaAndMint(
      provider,
      hntMint,
      toBN(startHntBal, hntDecimals).toNumber(),
      me
    );
    await createAtaAndMint(
      provider,
      dcMint,
      toBN(startDcBal, dcDecimals).toNumber(),
      me
    );
    const method = await program.methods
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
        hntPriceOracle: HNT_PYTH_PRICE_FEED,
      });
    dcKey = (await method.pubkeys()).dataCredits!;
    await method.rpc({
      skipPreflight: true,
    });
  });

  it("initializes data credits", async () => {
    const dataCreditsAcc = await program.account.dataCreditsV0.fetch(dcKey);
    assert(dataCreditsAcc?.dcMint.equals(dcMint));
    assert(dataCreditsAcc?.hntMint.equals(hntMint));
    assert(dataCreditsAcc?.authority.equals(me));
  });

  describe("with data credits", async () => {
    let dao: PublicKey;
    let subDao: PublicKey;

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
            await getAssociatedTokenAddress(hntMint, me),
            me,
            hntMint
          ),
        ])
        .accounts({
          dcMint,
          hntMint,
          hstPool: await getAssociatedTokenAddress(hntMint, me),
        });
      ensureHSDIdl(hsdProgram);

      dao = (await method.pubkeys()).dao!;
      if (!(await provider.connection.getAccountInfo(dao))) {
        await method.rpc({ skipPreflight: true });
      }

      ({ subDao } = await initTestSubdao(hsdProgram, provider, me, dao));
    });

    it("mints some data credits", async () => {
      await program.methods
        .mintDataCreditsV0({
          hntAmount: new BN(1 * 10 ** 8),
        })
        .accounts({ dcMint })
        .rpc({ skipPreflight: true });

      const dcAta = await getAssociatedTokenAddress(dcMint, me);
      const dcAtaAcc = await getAccount(provider.connection, dcAta);

      assert(dcAtaAcc.isFrozen);
      const dcBal = await provider.connection.getTokenAccountBalance(dcAta);
      const hntBal = await provider.connection.getTokenAccountBalance(
        await getAssociatedTokenAddress(hntMint, me)
      );
      const pythData = (await provider.connection.getAccountInfo(
        HNT_PYTH_PRICE_FEED
      ))!.data;
      const price = parsePriceData(pythData);
      const approxEndBal =
        startDcBal + Math.floor(price.emaPrice.value * 10 ** 5);
      expect(dcBal.value.uiAmount).to.be.within(
        approxEndBal - 1,
        approxEndBal + 1
      );
      expect(hntBal.value.uiAmount).to.eq(startHntBal - 1);
    });

    it("burns some data credits", async () => {
      await provider.connection.requestAirdrop(
        accountPayerKey()[0],
        web3.LAMPORTS_PER_SOL
      );

      const { subDaoEpochInfo } = await burnDataCredits({
        program,
        subDao,
        amount: 1,
      });

      const dcAta = await getAssociatedTokenAddress(dcMint, me);
      const dcAtaAcc = await getAccount(provider.connection, dcAta);

      assert(dcAtaAcc.isFrozen);
      const dcBal = await provider.connection.getTokenAccountBalance(dcAta);
      expect(dcBal.value.uiAmount).to.eq(startDcBal - 1);

      // check that epoch info was tracked correctly
      const epochInfo = await hsdProgram.account.subDaoEpochInfoV0.fetch(
        subDaoEpochInfo
      );
      const numBurned = toNumber(epochInfo.dcBurned as BN, dcDecimals);
      expect(numBurned).to.eq(1);
    });

    it("updates data credits", async () => {
      await program.methods
        .updateDataCreditsV0({
          newAuthority: PublicKey.default,
        })
        .accounts({
          dcMint,
        })
        .rpc();

      const dc = dataCreditsKey(dcMint)[0];
      const dcAcc = await program.account.dataCreditsV0.fetch(dc);

      assert.isTrue(PublicKey.default.equals(dcAcc.authority));
    });
  });
});
