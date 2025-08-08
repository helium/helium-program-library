import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair as HeliumKeypair } from "@helium/crypto";
import { VoterStakeRegistry } from "@helium/idls/lib/types/voter_stake_registry";
import { createAtaAndMint, createMint } from "@helium/spl-utils";
import {
  PythSolanaReceiver,
  pythSolanaReceiverIdl,
} from "@helium/currency-utils";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAccount,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import * as web3 from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { assert, expect } from "chai";
import { ThresholdType } from "../packages/circuit-breaker-sdk/src";
import {
  accountPayerKey,
  dataCreditsKey,
  delegatedDataCreditsKey,
  escrowAccountKey,
  init,
  mintDataCredits,
} from "../packages/data-credits-sdk/src";
import { PROGRAM_ID } from "../packages/data-credits-sdk/src/constants";
import * as hsd from "../packages/helium-sub-daos-sdk/src";
import { daoKey, delegatorRewardsPercent } from "../packages/helium-sub-daos-sdk/src";
import { toBN, toNumber } from "../packages/spl-utils/src";
import * as vsr from "../packages/voter-stake-registry-sdk/src";
import { DataCredits } from "../target/types/data_credits";
import { NftProxy } from "@helium/modular-governance-idls/lib/types/nft_proxy";
import { HeliumSubDaos } from "../target/types/helium_sub_daos";
import { initTestSubdao } from "./utils/daos";
import { ensureHSDIdl, ensureIdl, ensureVSRIdl } from "./utils/fixtures";
import { init as initNftProxy } from "@helium/nft-proxy-sdk";
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
  console.log("start delegate")
  const useData = await program.methods
    .delegateDataCreditsV0({
      amount: toBN(amount, 0),
      routerKey: (await HeliumKeypair.makeRandom()).address.b58,
    })
    .accountsPartial({
      subDao,
    });

  const delegatedDataCredits = (await useData.pubkeys()).delegatedDataCredits!;
  await useData.rpc({ skipPreflight: true });
  console.log("end delegate");
  const burn = program.methods
    .burnDelegatedDataCreditsV0({
      amount: toBN(amount, 0),
    })
    .accountsPartial({
      delegatedDataCredits,
    });

  await burn.rpc({ skipPreflight: true });

  console.log("end burn");
  return {
    subDaoEpochInfo: (await burn.pubkeys()).subDaoEpochInfo!,
  };
}

describe("data-credits", () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  let program: Program<DataCredits>;
  let hsdProgram: Program<HeliumSubDaos>;
  let vsrProgram: Program<VoterStakeRegistry>;
  let nftProxyProgram: Program<NftProxy>;
  let pythProgram: Program<PythSolanaReceiver>;
  let dcKey: PublicKey;
  let hntMint: PublicKey;
  let dcMint: PublicKey;
  let startHntBal = 10000;
  let startDcBal = 2;
  let hntDecimals = 8;
  let dcDecimals = 0;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;

  before(async () => {
    pythProgram = new Program(
      pythSolanaReceiverIdl as any,
    );
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
    nftProxyProgram = await initNftProxy(provider);
    await ensureVSRIdl();
    await ensureHSDIdl();
  })

  beforeEach(async () => {
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
      .accountsPartial({
        hntMint,
        dcMint,
        payer: me,
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
          nftProxyProgram,
          provider,
          provider.wallet.publicKey,
          hntMint,
          daoKey(hntMint)[0]
        )
      ).registrar;
      const rewardsEscrow = await createAtaAndMint(
        provider,
        hntMint,
        0,
        provider.wallet.publicKey
      );
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
          proposalNamespace: PublicKey.default,
          delegatorRewardsPercent: delegatorRewardsPercent(6),
        })
        .preInstructions([
          createAssociatedTokenAccountIdempotentInstruction(
            me,
            await getAssociatedTokenAddress(hntMint, me),
            me,
            hntMint
          ),
        ])
        .accountsPartial({
          dcMint,
          rewardsEscrow,
          hntMint,
          hstPool: await getAssociatedTokenAddress(hntMint, me),
        });

      dao = (await method.pubkeys()).dao!;
      if (!(await provider.connection.getAccountInfo(dao))) {
        await method.rpc({ skipPreflight: true });
      }

      ({ subDao } = await initTestSubdao({
        hsdProgram,
        provider,
        authority: me,
        dao,
      }));
    });

    it("mints some data credits with hnt amount", async () => {
      const { txs, priceUpdates } = await mintDataCredits({
        dcMint,
        program,
        hntAmount: new BN(1 * 10 ** 8),
      });
      console.log('txs', JSON.stringify(txs, null, 2));

      await provider.sendAll(txs, { skipPreflight: true })

      const dcAta = await getAssociatedTokenAddress(dcMint, me);
      const dcAtaAcc = await getAccount(provider.connection, dcAta);
      const hntAta = await getAssociatedTokenAddress(hntMint, me);
      assert(dcAtaAcc.isFrozen);
      const dcBal = await provider.connection.getTokenAccountBalance(dcAta);
      const hntBal = await provider.connection.getTokenAccountBalance(hntAta);
      const price = priceUpdates.parsed![0];

      const approxEndBal =
        startDcBal +
        Math.floor(
          new BN(price.ema_price.price)
            .sub(new BN(price.ema_price.conf).mul(new BN(2)))
            .toNumber() *
          10 ** price.ema_price.expo *
          10 ** 5
        );
      expect(dcBal.value.uiAmount).to.be.within(
        approxEndBal - 1,
        approxEndBal + 1
      );
      expect(hntBal.value.uiAmount).to.eq(startHntBal - 1);
    });

    it("mints some data credits with dc amount", async () => {
      let dcAmount = 1428 * 10 ** 5;
      const { txs, priceUpdates } = await mintDataCredits({
        dcMint,
        program,
        dcAmount: new BN(dcAmount),
      });

      await provider.sendAll(txs)

      const dcAta = await getAssociatedTokenAddress(dcMint, me);
      const dcAtaAcc = await getAccount(provider.connection, dcAta);

      assert(dcAtaAcc.isFrozen);
      const dcBal = await provider.connection.getTokenAccountBalance(dcAta);
      const hntBal = await provider.connection.getTokenAccountBalance(
        await getAssociatedTokenAddress(hntMint, me)
      );

      const price = priceUpdates.parsed![0];
      const hntEmaPrice =
        new BN(price.ema_price.price)
          .sub(new BN(price.ema_price.conf).mul(new BN(2)))
          .toNumber() *
        10 ** price.ema_price.expo;
      const hntAmount =
        (Math.floor(dcAmount * 10 ** (hntDecimals - 5)) / hntEmaPrice) *
        10 ** -hntDecimals;

      const approxEndBal = startHntBal - hntAmount;
      expect(hntBal.value.uiAmount).to.be.within(
        approxEndBal * 0.999,
        approxEndBal * 1.001
      );
      expect(dcBal.value.uiAmount).to.eq(startDcBal + dcAmount);
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
        .accountsPartial({
          dcMint,
        })
        .rpc();

      const dc = dataCreditsKey(dcMint)[0];
      const dcAcc = await program.account.dataCreditsV0.fetch(dc);

      assert.isTrue(PublicKey.default.equals(dcAcc.authority));
    });

    it("redelegates delegated data credits", async () => {
      const { subDao: destinationSubDao } = await initTestSubdao({
        hsdProgram,
        provider,
        authority: me,
        dao,
      });

      const amount = 2;
      const routerKey = (await HeliumKeypair.makeRandom()).address.b58;
      const methodA = program.methods
        .delegateDataCreditsV0({
          amount: toBN(amount, 0),
          routerKey,
        })
        .accountsPartial({
          subDao,
        });
      const sourceDelegatedDataCredits = (await methodA.pubkeys())
        .delegatedDataCredits!;
      await methodA.rpc({ skipPreflight: true });

      const destinationDelegatedDataCredits = delegatedDataCreditsKey(
        destinationSubDao,
        routerKey
      )[0];

      await program.methods
        .changeDelegatedSubDaoV0({
          amount: toBN(amount, 0),
          routerKey,
        })
        .accountsPartial({
          delegatedDataCredits: sourceDelegatedDataCredits,
          destinationDelegatedDataCredits,
          subDao,
          destinationSubDao,
          authority: me,
        })
        .rpc({ skipPreflight: true });

      const sourceEscrow = escrowAccountKey(sourceDelegatedDataCredits)[0];
      const destinationEscrow = escrowAccountKey(
        destinationDelegatedDataCredits
      )[0];

      const sourceBal = await provider.connection.getTokenAccountBalance(
        sourceEscrow
      );
      const destinationBal = await provider.connection.getTokenAccountBalance(
        destinationEscrow
      );

      expect(sourceBal.value.uiAmount).to.eq(0);
      expect(destinationBal.value.uiAmount).to.eq(amount);
    });
  });
});
