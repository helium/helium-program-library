import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { init, positionVotingRewardsResolvers } from "@helium/position-voting-rewards-sdk";
import { PositionVotingRewards } from "@helium/idls/lib/types/position_voting_rewards";
import { VoterStakeRegistry } from "@helium/idls/lib/types/voter_stake_registry";
import { init as vsrInit } from "../packages/voter-stake-registry-sdk/src";
import { ensureVSRIdl } from "./utils/fixtures";
import { PublicKey } from "@solana/web3.js";
import { initVsr } from "./utils/vsr";
import { createMint } from "../packages/spl-utils/src";
import { daoKey } from "../packages/helium-sub-daos-sdk/src";

describe("position-voting-rewards", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  const program = new Program<PositionVotingRewards>(
    anchor.workspace.PositionVotingRewards.idl,
    anchor.workspace.PositionVotingRewards.programId,
    anchor.workspace.PositionVotingRewards.provider,
    anchor.workspace.PositionVotingRewards.coder,
    () => {
      return positionVotingRewardsResolvers;
    }
  );

  let vsrProgram: Program<VoterStakeRegistry>;
  let registrar: PublicKey;
  let genesisVotePowerMultiplierExpirationTs = 1;
  let hntMint: PublicKey;

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;

  before(async () => {
    hntMint = await createMint(provider, 8, me, me);
    vsrProgram = await vsrInit(
      provider,
      anchor.workspace.VoterStakeRegistry.programId,
      anchor.workspace.VoterStakeRegistry.idl
    );
    ensureVSRIdl(vsrProgram);

    ({ registrar } = await initVsr(
      vsrProgram,
      provider,
      me,
      hntMint,
      daoKey(hntMint)[0],
      genesisVotePowerMultiplierExpirationTs,
      3
    ));
  })

  const vehntOptions = [
    {
      name: "Case 1",
      options: {
        delay: 1000,
        lockupPeriods: 365,
        lockupAmount: 100,
        expectedMultiplier:
          Math.min((SECS_PER_DAY * 365) / MAX_LOCKUP, 1) * SCALE,
      },
    },
    {
      name: "Case 2",
      options: {
        delay: 15000,
        lockupPeriods: 183 * 4,
        lockupAmount: 50,
        expectedMultiplier:
          Math.min((SECS_PER_DAY * 183 * 4) / MAX_LOCKUP, 1) * SCALE,
      },
    },
    {
      name: "Case 3",
      options: {
        delay: 0,
        lockupPeriods: 365 * 4,
        lockupAmount: 50,
        expectedMultiplier:
          Math.min((SECS_PER_DAY * 365 * 4) / MAX_LOCKUP, 1) * SCALE,
      },
    },
    {
      name: "Case 4 (Cliff 100 4 years)",
      options: {
        delay: 15000,
        lockupPeriods: 365 * 4,
        lockupAmount: 100,
        kind: { cliff: {} },
        expectedMultiplier:
          Math.min((SECS_PER_DAY * 365 * 4) / MAX_LOCKUP, 1) * SCALE,
      },
    },
    {
      name: "Case 5 (Constant 100 4 years)",
      options: {
        delay: 0,
        lockupPeriods: 365 * 4,
        lockupAmount: 100,
        kind: { constant: {} },
        expectedMultiplier:
          Math.min((SECS_PER_DAY * 365 * 4) / MAX_LOCKUP, 1) * SCALE,
      },
    },
  ];

  vehntOptions.forEach(function ({ name, options }) {
    describe("vehnt tests - " + name, () => {
      before(() => {
        genesisVotePowerMultiplierExpirationTs = 1;
      });

      beforeEach(async () => {
        ({ position, vault } = await createPosition(
          vsrProgram,
          provider,
          registrar,
          hntMint,
          options,
          positionAuthorityKp
        ));
      });

      it("allows vehnt delegation", async () => {
        const lockupAmount = toBN(options.lockupAmount, 8);
        const method = program.methods
          .delegateV0()
          .accounts({
            position,
            subDao,
            positionAuthority: positionAuthorityKp.publicKey,
          })
          .signers([positionAuthorityKp]);
        const { delegatedPosition } = await method.pubkeys();
        await method.rpc({ skipPreflight: true });

        const acc = await program.account.delegatedPositionV0.fetch(
          delegatedPosition!
        );
        const sdAcc = await program.account.subDaoV0.fetch(subDao);
        const positionAcc = await vsrProgram.account.positionV0.fetch(position);
        const endTs = positionAcc.lockup.endTs.toNumber();
        const startTs = positionAcc.lockup.startTs.toNumber();
        const multiplier =
          typeof positionAcc.lockup.kind.cliff === "undefined"
            ? 1
            : (endTs - sdAcc.vehntLastCalculatedTs.toNumber()) /
              (endTs - startTs);

        const expectedVeHnt =
          options.lockupAmount * options.expectedMultiplier * multiplier;

        expectBnAccuracy(
          toBN(expectedVeHnt, 8).mul(new BN("1000000000000")),
          sdAcc.vehntDelegated,
          typeof options.kind?.constant !== "undefined" ? 0 : 0.00000000001
        );
        expectBnAccuracy(lockupAmount, acc.hntAmount, 0.01);
      });

      it("calculates subdao rewards", async () => {
        // Onboard one hotspot to add to the utility score
        const { rewardableEntityConfig } = await initTestRewardableEntityConfig(
          hemProgram,
          subDao
        );
        const { maker, collection, makerKeypair, merkle } = await initTestMaker(
          hemProgram,
          provider,
          rewardableEntityConfig,
          dao
        );
        const eccVerifier = loadKeypair(
          __dirname + "/keypairs/verifier-test.json"
        );
        const ecc = (await HeliumKeypair.makeRandom()).address.b58;
        const hotspotOwner = Keypair.generate();

        const { getAssetFn, getAssetProofFn, hotspot } =
          await createMockCompression({
            collection,
            dao,
            merkle,
            ecc,
            hotspotOwner,
          });
        console.log("I AM ISSUING");
        const issueMethod = hemProgram.methods
          .issueEntityV0({
            entityKey: Buffer.from(bs58.decode(ecc)),
          })
          .preInstructions([
            ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
          ])
          .accounts({
            maker,
            recipient: hotspotOwner.publicKey,
            issuingAuthority: makerKeypair.publicKey,
            dao,
            eccVerifier: eccVerifier.publicKey,
          })
          .signers([makerKeypair, eccVerifier]);

        await issueMethod.rpc({ skipPreflight: true });
        await dcProgram.methods
          .mintDataCreditsV0({
            // $50 onboard, $10 location assert
            dcAmount: toBN(60, 5),
            hntAmount: null,
          })
          .accounts({ dcMint })
          .rpc({ skipPreflight: true });

        const method = (
          await onboardIotHotspot({
            program: hemProgram,
            assetId: hotspot,
            maker,
            dao,
            rewardableEntityConfig,
            location: new BN(1000),
            getAssetFn,
            getAssetProofFn,
            dcFeePayer: me,
          })
        ).signers([makerKeypair, hotspotOwner]);

        const {
          pubkeys: { iotInfo: infoKey },
        } = await method.rpcAndKeys({ skipPreflight: true });

        await hemProgram.methods
          .setEntityActiveV0({
            isActive: true,
            entityKey: Buffer.from(bs58.decode(ecc)),
          })
          .accounts({
            activeDeviceAuthority: me,
            rewardableEntityConfig,
            info: infoKey! as PublicKey,
          })
          .rpc({ skipPreflight: true });

        const { subDaoEpochInfo } = await burnDc(1600000);
        const epoch = (
          await program.account.subDaoEpochInfoV0.fetch(subDaoEpochInfo)
        ).epoch;

        // delegate some vehnt
        await program.methods
          .delegateV0()
          .accounts({
            position,
            subDao,
            positionAuthority: positionAuthorityKp.publicKey,
          })
          .signers([positionAuthorityKp])
          .rpc({ skipPreflight: true });

        const instr = program.methods
          .calculateUtilityScoreV0({
            epoch,
          })
          .preInstructions([
            ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
          ])
          .accounts({
            subDao,
            dao,
          });

        const pubkeys = await instr.pubkeys();
        await instr.rpc({
          skipPreflight: true,
          commitment: "confirmed",
        });

        const subDaoInfo = await program.account.subDaoEpochInfoV0.fetch(
          subDaoEpochInfo
        );
        const daoInfo = await program.account.daoEpochInfoV0.fetch(
          pubkeys.daoEpochInfo!
        );

        expect(daoInfo.numUtilityScoresCalculated).to.eq(1);

        const supply = (await getMint(provider.connection, hntMint)).supply;
        const veHnt = toNumber(subDaoInfo.vehntAtEpochStart, 8);
        const totalUtility =
          Math.max(veHnt, 1) * Math.pow(50, 1 / 4) * Math.sqrt(16) * 1;
        expect(daoInfo.totalRewards.toString()).to.eq(EPOCH_REWARDS.toString());
        expect(daoInfo.currentHntSupply.toString()).to.eq(
          new BN(supply.toString()).add(new BN(EPOCH_REWARDS)).toString()
        );

        expectBnAccuracy(
          toBN(totalUtility, 12),
          daoInfo.totalUtilityScore,
          0.00000002
        );
        expectBnAccuracy(
          toBN(totalUtility, 12),
          subDaoInfo.utilityScore!,
          0.00000002
        );
      });

      it("allows transfers", async () => {
        const { position: newPos } = await createPosition(
          vsrProgram,
          provider,
          registrar,
          hntMint,
          options,
          positionAuthorityKp
        );
        await program.methods
          .transferV0({ amount: toBN(10, 8) })
          .accounts({
            sourcePosition: position,
            targetPosition: newPos,
            depositMint: hntMint,
            positionAuthority: positionAuthorityKp.publicKey,
          })
          .signers([positionAuthorityKp])
          .rpc();
      });

      it("allows lockup resets", async () => {
        await program.methods
          .resetLockupV0({
            kind: { constant: {} },
            periods: 365 * 4,
          })
          .accounts({
            dao,
            position: position,
            positionAuthority: positionAuthorityKp.publicKey,
          })
          .signers([positionAuthorityKp])
          .rpc();
      });

      describe("with delegated vehnt", () => {
        beforeEach(async () => {
          await program.methods
            .delegateV0()
            .accounts({
              position,
              subDao,
              positionAuthority: positionAuthorityKp.publicKey,
            })
            .signers([positionAuthorityKp])
            .rpc({ skipPreflight: true });
        });

        it("does not allow transfers", async () => {
          const { position: newPos } = await createPosition(
            vsrProgram,
            provider,
            registrar,
            hntMint,
            options,
            positionAuthorityKp
          );
          await expect(
            program.methods
              .transferV0({ amount: toBN(10, 8) })
              .accounts({
                sourcePosition: position,
                targetPosition: newPos,
                depositMint: hntMint,
                positionAuthority: positionAuthorityKp.publicKey,
              })
              .signers([positionAuthorityKp])
              .rpc()
          ).to.eventually.be.rejectedWith(
            "AnchorError caused by account: source_delegated_position. Error Code: PositionChangeWhileDelegated. Error Number: 6014. Error Message: Cannot change a position while it is delegated."
          );
        });

        it("does not allow lockup resets", async () => {
          await expect(
            program.methods
              .resetLockupV0({
                kind: { constant: {} },
                periods: 182 * 4,
              })
              .accounts({
                dao,
                position: position,
                positionAuthority: positionAuthorityKp.publicKey,
              })
              .signers([positionAuthorityKp])
              .rpc()
          ).to.eventually.be.rejectedWith(
            "AnchorError caused by account: delegated_position. Error Code: PositionChangeWhileDelegated. Error Number: 6014. Error Message: Cannot change a position while it is delegated."
          );
        });

        it("allows closing delegate", async () => {
          await sleep(options.delay);
          const method = program.methods
            .closeDelegationV0()
            .accounts({
              position,
              subDao,
              positionAuthority: positionAuthorityKp.publicKey,
            })
            .signers([positionAuthorityKp]);

          const { delegatedPosition, subDaoEpochInfo } = await method.pubkeys();
          await method.rpc({ skipPreflight: true });

          const sdAcc = await program.account.subDaoV0.fetch(subDao);

          expect(sdAcc.vehntFallRate.toNumber()).to.eq(0);
          // Extremely precise u128 can be off by dust.
          expect(sdAcc.vehntDelegated.toNumber()).to.be.closeTo(0, 15);

          assert.isFalse(
            !!(await provider.connection.getAccountInfo(delegatedPosition!))
          );
        });

        describe("with multiple delegated vehnt", () => {
          let basePosition: PublicKey;
          let basePositionOptions = {
            lockupPeriods: 365 * 1,
            lockupAmount: 1000000,
            kind: { cliff: {} },
            expectedMultiplier:
              Math.min((SECS_PER_DAY * 365 * 1) / MAX_LOCKUP, 1) * SCALE,
          };

          beforeEach(async () => {
            ({ position: basePosition } = await createPosition(
              vsrProgram,
              provider,
              registrar,
              hntMint,
              basePositionOptions,
              positionAuthorityKp
            ));

            await program.methods
              .delegateV0()
              .accounts({
                position: basePosition,
                subDao,
                positionAuthority: positionAuthorityKp.publicKey,
              })
              .signers([positionAuthorityKp])
              .rpc({ skipPreflight: true });
          });

          it("delegates proper vehnt amount", async () => {
            const sdAcc = await program.account.subDaoV0.fetch(subDao);

            const expectedVehnt =
              options.lockupAmount * options.expectedMultiplier +
              basePositionOptions.lockupAmount *
                basePositionOptions.expectedMultiplier;

            expectBnAccuracy(
              toBN(expectedVehnt, 8).mul(new BN("1000000000000")),
              sdAcc.vehntDelegated,
              0.0000001
            );
          });

          it("allows closing delegate", async () => {
            const method = program.methods
              .closeDelegationV0()
              .accounts({
                position: basePosition,
                subDao,
                positionAuthority: positionAuthorityKp.publicKey,
              })
              .signers([positionAuthorityKp]);

            const { delegatedPosition, subDaoEpochInfo } =
              await method.pubkeys();
            // const sed = await program.account.subDaoEpochInfoV0.fetch(
            //   subDaoEpochInfo!
            // );
            // console.log(sed.fallRatesFromClosingPositions.toString());
            // console.log(sed.vehntInClosingPositions.toString());
            await method.rpc({ skipPreflight: true });

            const sdAcc = await program.account.subDaoV0.fetch(subDao);
            const positionAcc = await vsrProgram.account.positionV0.fetch(
              position
            );
            const endTs = positionAcc.lockup.endTs.toNumber();
            const startTs = positionAcc.lockup.startTs.toNumber();
            const multiplier =
              typeof positionAcc.lockup.kind.cliff === "undefined"
                ? 1
                : (endTs - sdAcc.vehntLastCalculatedTs.toNumber()) /
                  (endTs - startTs);

            const expectedVehnt =
              options.lockupAmount * options.expectedMultiplier * multiplier;

            expectBnAccuracy(
              toBN(expectedVehnt, 8).mul(new BN("1000000000000")),
              sdAcc.vehntDelegated,
              0.0000000001
            );

            expect(sdAcc.vehntFallRate.toNumber()).to.be.closeTo(
              typeof positionAcc.lockup.kind.cliff !== "undefined"
                ? ((options.lockupAmount * options.expectedMultiplier) /
                    (endTs - startTs)) *
                    100000000000000000000
                : 0,
              1
            );

            assert.isFalse(
              !!(await provider.connection.getAccountInfo(delegatedPosition!))
            );
          });
        });

        describe("with calculated rewards", () => {
          let epoch: anchor.BN;
          let subDaoEpochInfo: PublicKey;

          beforeEach(async () => {
            await vsrProgram.methods
              .setTimeOffsetV0(new BN(1 * 60 * 60 * 24))
              .accounts({ registrar })
              .rpc({ skipPreflight: true });

            ({ subDaoEpochInfo } = await burnDc(1600000));
            epoch = (
              await program.account.subDaoEpochInfoV0.fetch(subDaoEpochInfo)
            ).epoch;

            await program.methods
              .calculateUtilityScoreV0({
                epoch,
              })
              .preInstructions([
                ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
              ])
              .accounts({
                subDao,
                dao,
              })
              .rpc({ skipPreflight: true });
          });

          it("issues hnt rewards to subdaos, dnt to rewards escrow, and hst to hst pool", async () => {
            const preBalance = AccountLayout.decode(
              (await provider.connection.getAccountInfo(treasury))?.data!
            ).amount;
            const preHstBalance = AccountLayout.decode(
              (await provider.connection.getAccountInfo(hstPool))?.data!
            ).amount;
            const preMobileBalance = AccountLayout.decode(
              (await provider.connection.getAccountInfo(rewardsEscrow))?.data!
            ).amount;
            await program.methods
              .issueRewardsV0({
                epoch,
              })
              .accounts({
                subDao,
              })
              .rpc({ skipPreflight: true });

            await program.methods
              .issueHstPoolV0({
                epoch,
              })
              .accounts({
                dao,
              })
              .rpc({ skipPreflight: true });

            const postBalance = AccountLayout.decode(
              (await provider.connection.getAccountInfo(treasury))?.data!
            ).amount;
            const postMobileBalance = AccountLayout.decode(
              (await provider.connection.getAccountInfo(rewardsEscrow))?.data!
            ).amount;
            const postHstBalance = AccountLayout.decode(
              (await provider.connection.getAccountInfo(hstPool))?.data!
            ).amount;
            expect((postBalance - preBalance).toString()).to.eq(
              ((1 - 0.32) * EPOCH_REWARDS).toString()
            );
            expect((postHstBalance - preHstBalance).toString()).to.eq(
              (0.32 * EPOCH_REWARDS).toString()
            );
            expect((postMobileBalance - preMobileBalance).toString()).to.eq(
              ((SUB_DAO_EPOCH_REWARDS / 100) * 94).toString()
            );

            const acc = await program.account.subDaoEpochInfoV0.fetch(
              subDaoEpochInfo
            );
            expect(Boolean(acc.rewardsIssuedAt)).to.be.true;
          });

          it("claim rewards", async () => {
            // issue rewards
            await sendInstructions(provider, [
              await program.methods
                .issueRewardsV0({
                  epoch,
                })
                .accounts({
                  subDao,
                })
                .instruction(),
            ]);

            const method = program.methods
              .claimRewardsV0({
                epoch,
              })
              .accounts({
                position,
                subDao,
                positionAuthority: positionAuthorityKp.publicKey,
              })
              .signers([positionAuthorityKp]);
            const { delegatorAta } = await method.pubkeys();
            await method.rpc({ skipPreflight: true });

            const postAtaBalance = AccountLayout.decode(
              (await provider.connection.getAccountInfo(delegatorAta!))?.data!
            ).amount;
            expect(Number(postAtaBalance)).to.be.within(
              (SUB_DAO_EPOCH_REWARDS * 6) / 100 - 5,
              (SUB_DAO_EPOCH_REWARDS * 6) / 100
            );
          });
        });
      });
    });
  });
})