import { EPOCH_LENGTH } from "@helium/helium-sub-daos-sdk";
import {
  HNT_PYTH_PRICE_FEED,
  createAtaAndTransfer,
  createMintInstructions,
  roundToDecimals,
  toBN,
  toNumber,
} from "@helium/spl-utils";
import { getMint } from "@solana/spl-token";
import { ComputeBudgetProgram, Keypair } from "@solana/web3.js";
import { BN } from "bn.js";
import { expect } from "chai";
import { notEmittedKey, notEmittedCounterKey } from "@helium/no-emit-sdk";
import {
  currentEpoch,
  subDaoEpochInfoKey,
} from "../packages/helium-sub-daos-sdk/src";
import { initTestDao, initTestSubdao } from "./utils/daos";
import {
  EPOCH_REWARDS,
  EPOCH_REWARDS_PLUS_NET_EMISSIONS,
  NOT_EMITTED_AMOUNT,
  SubDaoTestContext,
  describeVehntCases,
  me,
  provider,
  useDaoAndSubDaoWorld,
  useSubDaoPrograms,
} from "./utils/helium-sub-daos";
import { createPosition } from "./utils/vsr";
import { getUnixTimestamp } from "./utils/solana";

describe("helium-sub-daos", () => {
  const ctx: SubDaoTestContext = useSubDaoPrograms();

  it("initializes a dao", async () => {
    const { dao, mint } = await initTestDao(
      ctx.program,
      provider,
      EPOCH_REWARDS,
      provider.wallet.publicKey,
    );
    const account = await ctx.program.account.daoV0.fetch(dao!);
    expect(account.authority.toBase58()).eq(me.toBase58());
    expect(account.hntMint.toBase58()).eq(mint.toBase58());
  });

  it("initializes a subdao", async () => {
    const { dao } = await initTestDao(
      ctx.program,
      provider,
      EPOCH_REWARDS,
      provider.wallet.publicKey,
    );
    const { subDao, treasury, mint, treasuryCircuitBreaker } =
      await initTestSubdao({
        hsdProgram: ctx.program,
        provider,
        authority: provider.wallet.publicKey,
        dao,
      });

    const account = await ctx.program.account.subDaoV0.fetch(subDao!);
    const breaker =
      await ctx.cbProgram.account.accountWindowedCircuitBreakerV0.fetch(
        treasuryCircuitBreaker,
      );

    // @ts-ignore
    expect(Boolean(breaker.config.thresholdType.percent)).to.be.true;

    expect(account.authority.toBase58()).eq(me.toBase58());
    expect(account.treasury.toBase58()).eq(treasury.toBase58());
    expect(account.dntMint.toBase58()).eq(mint.toBase58());
  });

  describe("with dao and subdao", () => {
    useDaoAndSubDaoWorld(ctx);

    it("updates the dao", async () => {
      const newAuth = Keypair.generate().publicKey;
      await ctx.program.methods
        .updateDaoV0({
          authority: newAuth,
          emissionSchedule: null,
          hstEmissionSchedule: null,
          hstPool: null,
          netEmissionsCap: null,
          proposalNamespace: null,
          delegatorRewardsPercent: null,
          rewardsEscrow: null,
        })
        .accountsPartial({
          dao: ctx.dao,
        })
        .rpc({ skipPreflight: true });

      const daoAcc = await ctx.program.account.daoV0.fetch(ctx.dao);
      expect(daoAcc.authority.toString()).to.eq(newAuth.toString());
    });

    it("updates the subdao", async () => {
      const newAuth = Keypair.generate().publicKey;
      await ctx.program.methods
        .updateSubDaoV0({
          authority: newAuth,
          dcBurnAuthority: null,
          emissionSchedule: null,
          onboardingDcFee: null,
          onboardingDataOnlyDcFee: null,
          registrar: null,
          activeDeviceAuthority: null,
        })
        .accountsPartial({
          subDao: ctx.subDao,
        })
        .rpc({ skipPreflight: true });

      const subDaoAcc = await ctx.program.account.subDaoV0.fetch(ctx.subDao);
      expect(subDaoAcc.authority.toString()).to.eq(newAuth.toString());
    });

    it("allows tracking dc spend", async () => {
      const { subDaoEpochInfo } = await ctx.burnDc(10);

      const epochInfo =
        await ctx.program.account.subDaoEpochInfoV0.fetch(subDaoEpochInfo);

      expect(epochInfo.dcBurned.toNumber()).eq(toBN(10, 0).toNumber());
    });

    it("accounts for not emitted HNT when calculating utility scores", async () => {
      const mint = Keypair.generate();
      await ctx.hemProgram.methods
        .issueNotEmittedEntityV0()
        .preInstructions(
          await createMintInstructions(provider, 0, me, me, mint),
        )
        .accountsPartial({
          dao: ctx.dao,
          mint: mint.publicKey,
        })
        .signers([mint])
        .rpc({ skipPreflight: true });

      const notEmittedAmount = new BN(NOT_EMITTED_AMOUNT);
      const [noEmitWallet] = notEmittedKey();
      const [noEmitCounterKey] = notEmittedCounterKey(ctx.hntMint);

      async function emitAndVerifyEpoch() {
        await createAtaAndTransfer(
          provider,
          ctx.hntMint,
          notEmittedAmount,
          me,
          noEmitWallet,
        );

        await ctx.noEmitProgram.methods
          .noEmitV0()
          .accounts({ mint: ctx.hntMint })
          .rpc({ skipPreflight: true });

        const { subDaoEpochInfo } = await ctx.burnDc(10);
        const epoch = (
          await ctx.program.account.subDaoEpochInfoV0.fetch(subDaoEpochInfo)
        ).epoch;

        const method = ctx.program.methods
          .calculateUtilityScoreV0({ epoch })
          .accountsPartial({
            subDao: ctx.subDao,
            dao: ctx.dao,
            hntPriceOracle: null,
          });

        const { daoEpochInfo } = await method.pubkeys();
        await method.rpc({ skipPreflight: true });

        const noEmitCounter =
          await ctx.noEmitProgram.account.notEmittedCounterV0.fetch(
            noEmitCounterKey,
          );
        const daoEpochInfoAcc = await ctx.program.account.daoEpochInfoV0.fetch(
          daoEpochInfo!,
        );

        return { noEmitCounter, daoEpochInfoAcc };
      }

      const firstEpoch = await emitAndVerifyEpoch();
      expect(firstEpoch.daoEpochInfoAcc.cumulativeNotEmitted.toString()).to.eq(
        firstEpoch.noEmitCounter.amountNotEmitted.toString(),
      );
      expect(firstEpoch.daoEpochInfoAcc.notEmitted.toString()).to.eq(
        notEmittedAmount.toString(),
      );

      let expectedRewards = EPOCH_REWARDS_PLUS_NET_EMISSIONS;
      expect(firstEpoch.daoEpochInfoAcc.totalRewards.toString()).to.eq(
        expectedRewards.toString(),
      );

      const supply = (await getMint(provider.connection, ctx.hntMint)).supply;
      expect(firstEpoch.daoEpochInfoAcc.currentHntSupply.toString()).to.eq(
        new BN(supply.toString()).add(new BN(expectedRewards)).toString(),
      );
    });

    describe("backstop ceiling", () => {
      it("computes the deployer cap when an oracle is supplied", async () => {
        await ctx.vsrProgram.methods
          .setTimeOffsetV0(new BN(1 * 60 * 60 * 24))
          .accountsPartial({ registrar: ctx.registrar })
          .rpc({ skipPreflight: true });

        // Carrier-paid DC burn for the epoch; drives the 3x earnings-cap ceiling.
        const { subDaoEpochInfo } = await ctx.burnDc(50000);
        const epoch = (
          await ctx.program.account.subDaoEpochInfoV0.fetch(subDaoEpochInfo)
        ).epoch;

        const method = ctx.program.methods
          .calculateUtilityScoreV0({ epoch })
          .preInstructions([
            ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
          ])
          .accountsPartial({
            subDao: ctx.subDao,
            dao: ctx.dao,
            // HNT/USD Pyth push account, cloned from mainnet by the test validator.
            hntPriceOracle: HNT_PYTH_PRICE_FEED,
          });
        const { daoEpochInfo } = await method.pubkeys();
        await method.rpc({ skipPreflight: true });

        const acc = await ctx.program.account.daoEpochInfoV0.fetch(
          daoEpochInfo!,
        );
        // 3x-carrier-paid earnings ceiling computed from dc_burned + price.
        expect(acc.deployerCapHnt.toNumber()).to.be.greaterThan(0);
      });

      it("stays dormant (no cap) when no oracle is supplied", async () => {
        await ctx.vsrProgram.methods
          .setTimeOffsetV0(new BN(1 * 60 * 60 * 24))
          .accountsPartial({ registrar: ctx.registrar })
          .rpc({ skipPreflight: true });

        const { subDaoEpochInfo } = await ctx.burnDc(50000);
        const epoch = (
          await ctx.program.account.subDaoEpochInfoV0.fetch(subDaoEpochInfo)
        ).epoch;

        const method = ctx.program.methods
          .calculateUtilityScoreV0({ epoch })
          .preInstructions([
            ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
          ])
          .accountsPartial({
            subDao: ctx.subDao,
            dao: ctx.dao,
            hntPriceOracle: null,
          });
        const { daoEpochInfo } = await method.pubkeys();
        await method.rpc({ skipPreflight: true });

        const acc = await ctx.program.account.daoEpochInfoV0.fetch(
          daoEpochInfo!,
        );
        // No oracle => backstop dormant: no ceiling.
        expect(acc.deployerCapHnt.toNumber()).to.eq(0);
      });
    });

    describe("with position", () => {
      before(() => {
        ctx.genesisVotePowerMultiplierExpirationTs = 1;
      });

      beforeEach(async () => {
        ({ position: ctx.position, vault: ctx.vault } = await createPosition(
          ctx.vsrProgram,
          provider,
          ctx.registrar,
          ctx.hntMint,
          { lockupPeriods: 1, lockupAmount: 100 },
          ctx.positionAuthorityKp,
        ));
      });

      it("updates the subdao vehnt to 0 when the final epoch passes", async () => {
        const epoch = currentEpoch(
          new BN(Number(await getUnixTimestamp(provider))),
        );

        await ctx.vsrProgram.methods
          .setTimeOffsetV0(new BN(1 * 60 * 60 * 24))
          .accountsPartial({ registrar: ctx.registrar })
          .rpc({ skipPreflight: true });
        await ctx.program.methods
          .calculateUtilityScoreV0({
            epoch,
          })
          .preInstructions([
            ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
          ])
          .accountsPartial({
            subDao: ctx.subDao,
            dao: ctx.dao,
            hntPriceOracle: null,
          })
          .rpc({ skipPreflight: true });

        const subDaoAccount = await ctx.program.account.subDaoV0.fetch(
          ctx.subDao,
        );
        expect(subDaoAccount.vehntDelegated.toNumber()).eq(0);
      });
    });

    describeVehntCases(ctx, ["Case 1"]);

    describe("with genesis config", () => {
      before(async () => {
        const currTs = Number(await getUnixTimestamp(provider));
        ctx.genesisVotePowerMultiplierExpirationTs = currTs + 60 * 60 * 24 * 7; // 7 days from now
      });

      it("correctly adjusts total vehnt at epoch start with changing genesis positions", async () => {
        ({ position: ctx.position, vault: ctx.vault } = await createPosition(
          ctx.vsrProgram,
          provider,
          ctx.registrar,
          ctx.hntMint,
          // max lockup
          {
            lockupPeriods: 1460,
            lockupAmount: 100,
            kind: { constant: {} },
          },
          ctx.positionAuthorityKp,
        ));
        await ctx.program.methods
          .delegateV0()
          .accountsPartial({
            position: ctx.position,
            subDao: ctx.subDao,
            positionAuthority: ctx.positionAuthorityKp.publicKey,
          })
          .signers([ctx.positionAuthorityKp])
          .rpc({ skipPreflight: true });

        // Burn dc to cause an update to subdao epoch info
        await ctx.burnDc(1);

        let offset = 0;
        async function getCurrEpochInfo() {
          const unixTime = Number(await getUnixTimestamp(provider)) + offset;
          return await ctx.program.account.subDaoEpochInfoV0.fetch(
            subDaoEpochInfoKey(ctx.subDao, unixTime)[0],
          );
        }

        async function ffwd(amount: number) {
          offset = amount;
          await ctx.vsrProgram.methods
            .setTimeOffsetV0(new BN(offset))
            .accountsPartial({ registrar: ctx.registrar })
            .rpc({ skipPreflight: true });
        }

        // Start off the epoch with 0 vehnt since we staked at the start of the epoch
        let subDaoEpochInfo = await getCurrEpochInfo();
        expect(subDaoEpochInfo.vehntAtEpochStart.toNumber()).to.eq(0);

        // Fast forward to a later epoch before genesis end
        await ffwd(EPOCH_LENGTH * 10);
        // Burn dc to cause an update to subdao epoch info
        await ctx.burnDc(1);
        subDaoEpochInfo = await getCurrEpochInfo();
        expect(toNumber(subDaoEpochInfo.vehntAtEpochStart, 8)).to.eq(300 * 100);

        // Switch to a cliff vest (start cooldown)
        const {
          pubkeys: { genesisEndSubDaoEpochInfo },
        } = await ctx.program.methods
          .closeDelegationV0()
          .accountsPartial({
            position: ctx.position,
            subDao: ctx.subDao,
            positionAuthority: ctx.positionAuthorityKp.publicKey,
          })
          .signers([ctx.positionAuthorityKp])
          .rpcAndKeys({ skipPreflight: true });
        await ctx.program.methods
          .resetLockupV0({
            kind: { cliff: {} },
            periods: 1460,
          })
          .accountsPartial({
            dao: ctx.dao,
            position: ctx.position,
            positionAuthority: ctx.positionAuthorityKp.publicKey,
          })
          .signers([ctx.positionAuthorityKp])
          .rpc({ skipPreflight: true });
        let subDaoAcc = await ctx.program.account.subDaoV0.fetch(ctx.subDao);
        expect(subDaoAcc.vehntDelegated.eq(new BN(0))).to.be.true;
        expect(subDaoAcc.vehntFallRate.eq(new BN(0))).to.be.true;
        const genesisEndEpoch =
          await ctx.program.account.subDaoEpochInfoV0.fetch(
            genesisEndSubDaoEpochInfo!,
          );
        expect(genesisEndEpoch.vehntInClosingPositions.eq(new BN(0))).to.be
          .true;
        expect(genesisEndEpoch.fallRatesFromClosingPositions.eq(new BN(0))).to
          .be.true;

        const {
          pubkeys: {
            genesisEndSubDaoEpochInfo: finalGenesisEndSubDaoEpochInfo,
          },
        } = await ctx.program.methods
          .delegateV0()
          .accountsPartial({
            position: ctx.position,
            subDao: ctx.subDao,
            positionAuthority: ctx.positionAuthorityKp.publicKey,
          })
          .signers([ctx.positionAuthorityKp])
          .rpcAndKeys({ skipPreflight: true });
        console.log(
          "Final end epoch subdao epoch info",
          finalGenesisEndSubDaoEpochInfo!.toBase58(),
        );
        let positionAcc = await ctx.vsrProgram.account.positionV0.fetch(
          ctx.position,
        );
        const stakeTime = positionAcc.lockup.startTs;

        console.log("Checking before genesis end");
        await ffwd(EPOCH_LENGTH * 20);
        await ctx.burnDc(1);
        subDaoEpochInfo = await getCurrEpochInfo();
        let currTime = subDaoEpochInfo.epoch.toNumber() * EPOCH_LENGTH;
        let timeStaked = currTime - stakeTime.toNumber();
        let expected = roundToDecimals(
          3 *
            100 *
            100 *
            ((1460 * EPOCH_LENGTH - timeStaked) / (1460 * EPOCH_LENGTH)),
          8,
        );
        expect(toNumber(subDaoEpochInfo.vehntAtEpochStart, 8)).to.be.closeTo(
          // Fall rates aren't a perfect measurement, we divide the total fall of the position by
          // the total time staked. Imagine the total fall was 1 and the total time was 3. We would have
          // a fall rate of 0.3333333333333333 and could never have enough decimals to represent it
          expected,
          0.0000001,
        );

        console.log("Checking genesis end");
        await ffwd(EPOCH_LENGTH * 1460);
        await ctx.burnDc(1);
        subDaoEpochInfo = await getCurrEpochInfo();
        currTime = subDaoEpochInfo.epoch.toNumber() * EPOCH_LENGTH;
        timeStaked = currTime - stakeTime.toNumber();
        expected = roundToDecimals(
          3 *
            100 *
            100 *
            ((1460 * EPOCH_LENGTH - timeStaked) / (1460 * EPOCH_LENGTH)),
          8,
        );
        expect(toNumber(subDaoEpochInfo.vehntAtEpochStart, 8)).to.be.closeTo(
          expected,
          0.0000001,
        );

        console.log("Checking after genesis end");
        await ffwd(EPOCH_LENGTH * 1461);
        await ctx.burnDc(1);
        subDaoEpochInfo = await getCurrEpochInfo();
        currTime = subDaoEpochInfo.epoch.toNumber() * EPOCH_LENGTH;
        timeStaked = currTime - stakeTime.toNumber();
        expected = roundToDecimals(
          100 *
            100 *
            ((1460 * EPOCH_LENGTH - timeStaked) / (1460 * EPOCH_LENGTH)),
          8,
        );
        expect(toNumber(subDaoEpochInfo.vehntAtEpochStart, 8)).to.be.closeTo(
          expected,
          0.0000001,
        );

        console.log("Checking at expiry");
        const unixTime = Number(await getUnixTimestamp(provider));
        const expiryOffset =
          stakeTime.toNumber() + EPOCH_LENGTH * 1460 - unixTime;
        await ffwd(expiryOffset);
        await ctx.burnDc(1);
        subDaoEpochInfo = await getCurrEpochInfo();
        currTime = subDaoEpochInfo.epoch.toNumber() * EPOCH_LENGTH;
        timeStaked = currTime - stakeTime.toNumber();
        expected = roundToDecimals(
          100 *
            100 *
            ((1460 * EPOCH_LENGTH - timeStaked) / (1460 * EPOCH_LENGTH)),
          8,
        );
        expect(toNumber(subDaoEpochInfo.vehntAtEpochStart, 8)).to.be.closeTo(
          expected,
          0.0000001,
        );

        console.log("Checking after expiry");
        await ffwd(expiryOffset + EPOCH_LENGTH * 2);
        await ctx.burnDc(1);
        subDaoEpochInfo = await getCurrEpochInfo();
        currTime = subDaoEpochInfo.epoch.toNumber() * EPOCH_LENGTH;
        timeStaked = currTime - stakeTime.toNumber();
        console.log(toNumber(subDaoEpochInfo.vehntAtEpochStart, 8));
        expect(toNumber(subDaoEpochInfo.vehntAtEpochStart, 8)).to.be.closeTo(
          0,
          0.0000001,
        );
      });

      it("correctly adjusts total vehnt at epoch start with unchanging genesis positions", async () => {
        ({ position: ctx.position, vault: ctx.vault } = await createPosition(
          ctx.vsrProgram,
          provider,
          ctx.registrar,
          ctx.hntMint,
          // max lockup
          {
            lockupPeriods: 1460,
            lockupAmount: 100,
            kind: { cliff: {} },
          },
          ctx.positionAuthorityKp,
        ));
        await ctx.program.methods
          .delegateV0()
          .accountsPartial({
            position: ctx.position,
            subDao: ctx.subDao,
            positionAuthority: ctx.positionAuthorityKp.publicKey,
          })
          .signers([ctx.positionAuthorityKp])
          .rpc({ skipPreflight: true });

        // Burn dc to cause an update to subdao epoch info
        await ctx.burnDc(1);

        let offset = 0;
        async function getCurrEpochInfo() {
          const unixTime = Number(await getUnixTimestamp(provider)) + offset;
          return await ctx.program.account.subDaoEpochInfoV0.fetch(
            subDaoEpochInfoKey(ctx.subDao, unixTime)[0],
          );
        }

        async function ffwd(amount: number) {
          offset = amount;
          await ctx.vsrProgram.methods
            .setTimeOffsetV0(new BN(offset))
            .accountsPartial({ registrar: ctx.registrar })
            .rpc({ skipPreflight: true });
        }

        // Start off the epoch with 0 vehnt since we staked at the start of the epoch
        let subDaoEpochInfo = await getCurrEpochInfo();
        expect(subDaoEpochInfo.vehntAtEpochStart.toNumber()).to.eq(0);

        // Fast forward to a later epoch before genesis end
        console.log("Checking before genesis end");
        await ffwd(EPOCH_LENGTH * 10);
        // Burn dc to cause an update to subdao epoch info
        await ctx.burnDc(1);
        subDaoEpochInfo = await getCurrEpochInfo();
        let positionAcc = await ctx.vsrProgram.account.positionV0.fetch(
          ctx.position,
        );
        const stakeTime = positionAcc.lockup.startTs;
        let currTime = subDaoEpochInfo.epoch.toNumber() * EPOCH_LENGTH;
        let timeStaked = currTime - stakeTime.toNumber();
        let expected = roundToDecimals(
          3 *
            100 *
            100 *
            ((1460 * EPOCH_LENGTH - timeStaked) / (1460 * EPOCH_LENGTH)),
          8,
        );
        expect(toNumber(subDaoEpochInfo.vehntAtEpochStart, 8)).to.be.closeTo(
          expected,
          0.0000001,
        );

        console.log("Checking genesis end");
        await ffwd(EPOCH_LENGTH * 1460);
        await ctx.burnDc(1);
        subDaoEpochInfo = await getCurrEpochInfo();
        currTime = subDaoEpochInfo.epoch.toNumber() * EPOCH_LENGTH;
        timeStaked = currTime - stakeTime.toNumber();
        expected = roundToDecimals(
          3 *
            100 *
            100 *
            ((1460 * EPOCH_LENGTH - timeStaked) / (1460 * EPOCH_LENGTH)),
          8,
        );
        expect(toNumber(subDaoEpochInfo.vehntAtEpochStart, 8)).to.be.closeTo(
          expected,
          0.0000001,
        );

        console.log("Checking after genesis end");
        await ffwd(EPOCH_LENGTH * 1461);
        await ctx.burnDc(1);
        subDaoEpochInfo = await getCurrEpochInfo();
        currTime = subDaoEpochInfo.epoch.toNumber() * EPOCH_LENGTH;
        timeStaked = currTime - stakeTime.toNumber();
        expected = 0;
        expect(toNumber(subDaoEpochInfo.vehntAtEpochStart, 8)).to.eq(0);
      });

      it("allows adding expiration ts", async () => {
        const registrarAcc = await ctx.vsrProgram.account.registrar.fetch(
          ctx.registrar,
        );
        const proxyConfig = registrarAcc.proxyConfig;

        ({ position: ctx.position, vault: ctx.vault } = await createPosition(
          ctx.vsrProgram,
          provider,
          ctx.registrar,
          ctx.hntMint,
          // max lockup
          {
            lockupPeriods: 1460,
            lockupAmount: 100,
            kind: { cliff: {} },
          },
          ctx.positionAuthorityKp,
        ));
        const {
          pubkeys: { closingTimeSubDaoEpochInfo, genesisEndSubDaoEpochInfo },
        } = await ctx.program.methods
          .delegateV0()
          .accountsPartial({
            position: ctx.position,
            subDao: ctx.subDao,
            positionAuthority: ctx.positionAuthorityKp.publicKey,
          })
          .signers([ctx.positionAuthorityKp])
          .rpcAndKeys({ skipPreflight: true });
        const seasonEnd = new BN(
          new Date().valueOf() / 1000 + EPOCH_LENGTH * 5,
        );
        await ctx.proxyProgram.methods
          .updateProxyConfigV0({
            maxProxyTime: null,
            seasons: [
              {
                start: new BN(0),
                end: seasonEnd,
              },
            ],
          })
          .accountsPartial({
            proxyConfig,
            authority: me,
          })
          .rpc({ skipPreflight: true });
        const subDaoEpochInfo =
          await ctx.program.account.subDaoEpochInfoV0.fetch(
            closingTimeSubDaoEpochInfo!,
          );
        const expectedFallRates =
          subDaoEpochInfo.fallRatesFromClosingPositions.toString();
        const expectedVehntInClosingPositions =
          subDaoEpochInfo.vehntInClosingPositions.toString();
        const newClosingTimeSubDaoEpochInfo = subDaoEpochInfoKey(
          ctx.subDao,
          seasonEnd,
        )[0];

        await ctx.program.methods
          .extendExpirationTsV0()
          .accountsPartial({
            position: ctx.position,
            subDao: ctx.subDao,
            oldClosingTimeSubDaoEpochInfo: closingTimeSubDaoEpochInfo,
            closingTimeSubDaoEpochInfo: newClosingTimeSubDaoEpochInfo,
            authority: ctx.positionAuthorityKp.publicKey,
          })
          .signers([ctx.positionAuthorityKp])
          .rpc({ skipPreflight: true });

        console.log(
          closingTimeSubDaoEpochInfo!.toBase58(),
          newClosingTimeSubDaoEpochInfo!.toBase58(),
        );
        const oldSubDaoEpochInfo =
          await ctx.program.account.subDaoEpochInfoV0.fetch(
            closingTimeSubDaoEpochInfo!,
          );
        expect(
          oldSubDaoEpochInfo.fallRatesFromClosingPositions.toNumber(),
        ).to.eq(0);
        expect(oldSubDaoEpochInfo.vehntInClosingPositions.toNumber()).to.eq(0);

        const newSubDaoEpochInfo =
          await ctx.program.account.subDaoEpochInfoV0.fetch(
            newClosingTimeSubDaoEpochInfo!,
          );
        expect(
          newSubDaoEpochInfo.fallRatesFromClosingPositions.toString(),
        ).to.eq("23782343987823439");

        const genesisEndEpoch =
          await ctx.program.account.subDaoEpochInfoV0.fetch(
            genesisEndSubDaoEpochInfo!,
          );
        expect(genesisEndEpoch.fallRatesFromClosingPositions.toNumber()).to.eq(
          0,
        );
        expect(genesisEndEpoch.vehntInClosingPositions.toNumber()).to.eq(0);
      });

      describe("with proxy season that ends before genesis end", () => {
        before(async () => {
          // 15 days from now
          ctx.proxySeasonEnd = new BN(
            new Date().valueOf() / 1000 + 15 * EPOCH_LENGTH,
          );
        });

        it("correctly adjusts total vehnt at epoch start with changing genesis positions", async () => {
          ({ position: ctx.position, vault: ctx.vault } = await createPosition(
            ctx.vsrProgram,
            provider,
            ctx.registrar,
            ctx.hntMint,
            // max lockup
            {
              lockupPeriods: 1460,
              lockupAmount: 100,
              kind: { constant: {} },
            },
            ctx.positionAuthorityKp,
          ));
          await ctx.program.methods
            .delegateV0()
            .accountsPartial({
              position: ctx.position,
              subDao: ctx.subDao,
              positionAuthority: ctx.positionAuthorityKp.publicKey,
            })
            .signers([ctx.positionAuthorityKp])
            .rpc({ skipPreflight: true });

          // Burn dc to cause an update to subdao epoch info
          await ctx.burnDc(1);

          let offset = 0;
          async function getCurrEpochInfo() {
            const unixTime = Number(await getUnixTimestamp(provider)) + offset;
            return await ctx.program.account.subDaoEpochInfoV0.fetch(
              subDaoEpochInfoKey(ctx.subDao, unixTime)[0],
            );
          }

          async function ffwd(amount: number) {
            offset = amount;
            await ctx.vsrProgram.methods
              .setTimeOffsetV0(new BN(offset))
              .accountsPartial({ registrar: ctx.registrar })
              .rpc({ skipPreflight: true });
          }

          // Start off the epoch with 0 vehnt since we staked at the start of the epoch
          let subDaoEpochInfo = await getCurrEpochInfo();
          expect(subDaoEpochInfo.vehntAtEpochStart.toNumber()).to.eq(0);

          // Fast forward to a later epoch before genesis end and position expiration
          await ffwd(EPOCH_LENGTH * 10);
          // Burn dc to cause an update to subdao epoch info
          await ctx.burnDc(1);
          subDaoEpochInfo = await getCurrEpochInfo();
          expect(toNumber(subDaoEpochInfo.vehntAtEpochStart, 8)).to.eq(
            300 * 100,
          );

          // Switch to a cliff vest (start cooldown)
          const {
            pubkeys: { genesisEndSubDaoEpochInfo },
          } = await ctx.program.methods
            .closeDelegationV0()
            .accountsPartial({
              position: ctx.position,
              subDao: ctx.subDao,
              positionAuthority: ctx.positionAuthorityKp.publicKey,
            })
            .signers([ctx.positionAuthorityKp])
            .rpcAndKeys({ skipPreflight: true });
          await ctx.program.methods
            .resetLockupV0({
              kind: { cliff: {} },
              periods: 1460,
            })
            .accountsPartial({
              dao: ctx.dao,
              position: ctx.position,
              positionAuthority: ctx.positionAuthorityKp.publicKey,
            })
            .signers([ctx.positionAuthorityKp])
            .rpc({ skipPreflight: true });
          let subDaoAcc = await ctx.program.account.subDaoV0.fetch(ctx.subDao);
          console.log(subDaoAcc.vehntDelegated);
          console.log(subDaoAcc.vehntFallRate);
          expect(subDaoAcc.vehntDelegated.eq(new BN(0))).to.be.true;
          expect(subDaoAcc.vehntFallRate.eq(new BN(0))).to.be.true;
          const genesisEndEpoch =
            await ctx.program.account.subDaoEpochInfoV0.fetch(
              genesisEndSubDaoEpochInfo!,
            );
          expect(genesisEndEpoch.vehntInClosingPositions.eq(new BN(0))).to.be
            .true;
          expect(genesisEndEpoch.fallRatesFromClosingPositions.eq(new BN(0))).to
            .be.true;

          const {
            pubkeys: {
              genesisEndSubDaoEpochInfo: finalGenesisEndSubDaoEpochInfo,
            },
          } = await ctx.program.methods
            .delegateV0()
            .accountsPartial({
              position: ctx.position,
              subDao: ctx.subDao,
              positionAuthority: ctx.positionAuthorityKp.publicKey,
            })
            .signers([ctx.positionAuthorityKp])
            .rpcAndKeys({ skipPreflight: true });
          console.log(
            "Final end epoch subdao epoch info",
            finalGenesisEndSubDaoEpochInfo!.toBase58(),
          );
          let positionAcc = await ctx.vsrProgram.account.positionV0.fetch(
            ctx.position,
          );
          const stakeTime = positionAcc.lockup.startTs;

          // Get to the actual expiration epoch and make sure to get an update
          await ffwd(EPOCH_LENGTH * 15);
          // Burn dc to cause an update to subdao epoch info
          await ctx.burnDc(1);

          console.log("Checking after delegation expiration");
          await ffwd(EPOCH_LENGTH * 20);
          await ctx.burnDc(1);
          subDaoEpochInfo = await getCurrEpochInfo();
          let currTime = subDaoEpochInfo.epoch.toNumber() * EPOCH_LENGTH;
          let timeStaked = currTime - stakeTime.toNumber();
          let expected = 0;
          expect(toNumber(subDaoEpochInfo.vehntAtEpochStart, 8)).to.be.closeTo(
            // Fall rates aren't a perfect measurement, we divide the total fall of the position by
            // the total time staked. Imagine the total fall was 1 and the total time was 3. We would have
            // a fall rate of 0.3333333333333333 and could never have enough decimals to represent it
            expected,
            0.0000001,
          );

          console.log("Checking genesis end");
          await ffwd(EPOCH_LENGTH * 1460);
          await ctx.burnDc(1);
          subDaoEpochInfo = await getCurrEpochInfo();
          currTime = subDaoEpochInfo.epoch.toNumber() * EPOCH_LENGTH;
          timeStaked = currTime - stakeTime.toNumber();
          expected = 0;
          expect(toNumber(subDaoEpochInfo.vehntAtEpochStart, 8)).to.be.closeTo(
            expected,
            0.0000001,
          );

          console.log("Checking after genesis end");
          await ffwd(EPOCH_LENGTH * 1461);
          await ctx.burnDc(1);
          subDaoEpochInfo = await getCurrEpochInfo();
          currTime = subDaoEpochInfo.epoch.toNumber() * EPOCH_LENGTH;
          timeStaked = currTime - stakeTime.toNumber();
          expected = 0;
          expect(toNumber(subDaoEpochInfo.vehntAtEpochStart, 8)).to.be.closeTo(
            expected,
            0.0000001,
          );

          console.log("Checking at expiry");
          const unixTime = Number(await getUnixTimestamp(provider));
          const expiryOffset =
            stakeTime.toNumber() + EPOCH_LENGTH * 1460 - unixTime;
          await ffwd(expiryOffset);
          await ctx.burnDc(1);
          subDaoEpochInfo = await getCurrEpochInfo();
          currTime = subDaoEpochInfo.epoch.toNumber() * EPOCH_LENGTH;
          timeStaked = currTime - stakeTime.toNumber();
          expected = 0;
          expect(toNumber(subDaoEpochInfo.vehntAtEpochStart, 8)).to.be.closeTo(
            expected,
            0.0000001,
          );

          console.log("Checking after expiry");
          await ffwd(expiryOffset + EPOCH_LENGTH * 2);
          await ctx.burnDc(1);
          subDaoEpochInfo = await getCurrEpochInfo();
          currTime = subDaoEpochInfo.epoch.toNumber() * EPOCH_LENGTH;
          timeStaked = currTime - stakeTime.toNumber();
          console.log(toNumber(subDaoEpochInfo.vehntAtEpochStart, 8));
          expect(toNumber(subDaoEpochInfo.vehntAtEpochStart, 8)).to.be.closeTo(
            0,
            0.0000001,
          );
        });
      });
    });
  });
});
