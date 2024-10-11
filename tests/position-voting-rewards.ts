import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { init, positionVotingRewardsResolvers, vsrEpochInfoKey } from "@helium/position-voting-rewards-sdk";
import { PositionVotingRewards } from "../target/types/position_voting_rewards";
import { VoterStakeRegistry } from "../target/types/voter_stake_registry";
import { init as vsrInit } from "../packages/voter-stake-registry-sdk/src";
import { ensureVSRIdl } from "./utils/fixtures";
import { Keypair, PublicKey } from "@solana/web3.js";
import { createPosition, initVsr } from "./utils/vsr";
import { createAtaAndMint, createMint, toBN, toNumber } from "../packages/spl-utils/src";
import { currentEpoch, daoKey } from "../packages/helium-sub-daos-sdk/src";
import chai, { assert, expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import { expectBnAccuracy } from "./utils/expectBnAccuracy";
import { getUnixTimestamp } from "./utils/solana";
import { AccountLayout } from "@solana/spl-token";

chai.use(chaiAsPromised);

const REWARDS = 10000000;
const SECS_PER_DAY = 86400;
const SECS_PER_YEAR = 365 * SECS_PER_DAY;
const MAX_LOCKUP = 4 * SECS_PER_YEAR;
const SCALE = 100;

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
  let positionAuthorityKp: Keypair;

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;

  beforeEach(async () => {
    positionAuthorityKp = Keypair.generate();
    hntMint = await createMint(provider, 8, me, me);
    await createAtaAndMint(provider, hntMint, toBN(REWARDS, 8), me);
    await createAtaAndMint(provider, hntMint, toBN(REWARDS, 8), positionAuthorityKp.publicKey);
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
      let position: PublicKey;
      let vetokenTracker: PublicKey;

      before(() => {
        genesisVotePowerMultiplierExpirationTs = 1;
      });

      beforeEach(async () => {
        ({ position } = await createPosition(
          vsrProgram,
          provider,
          registrar,
          hntMint,
          options,
          positionAuthorityKp
        ));
        let { pubkeys: { vetokenTracker: tracker } } = await program.methods.initializeVetokenTrackerV0().accounts({
          registrar,
          rewardsMint: hntMint,
          payer: me,
          rewardsAuthority: me,
        }).rpcAndKeys({ skipPreflight: true });
        vetokenTracker = tracker! as PublicKey;

        const registrarAcc = await vsrProgram.account.registrar.fetch(registrar);
        await vsrProgram.methods
          .updateRegistrarV0({
            positionFreezeAuthorities: [vetokenTracker],
            positionUpdateAuthority: null,
          })
          .accounts({
            registrar,
            proxyConfig: null,
          })
          .rpc({ skipPreflight: true });
      });

      it("allows vehnt enrollment", async () => {
        const method = program.methods
          .enrollV0()
          .accounts({
            position,
            vetokenTracker,
            positionAuthority: positionAuthorityKp.publicKey,
          })
          .signers([positionAuthorityKp]);
        await method.rpc({ skipPreflight: true });

        const trackerAcc = await program.account.veTokenTrackerV0.fetch(vetokenTracker);
        const positionAcc = await vsrProgram.account.positionV0.fetch(position);
        const endTs = positionAcc.lockup.endTs.toNumber();
        const startTs = positionAcc.lockup.startTs.toNumber();
        const multiplier =
          typeof positionAcc.lockup.kind.cliff === "undefined"
            ? 1
            : (endTs - trackerAcc.vetokenLastCalculatedTs.toNumber()) /
              (endTs - startTs);

        const expectedVeHnt =
          options.lockupAmount * options.expectedMultiplier * multiplier;

        expectBnAccuracy(
          toBN(expectedVeHnt, 8).mul(new anchor.BN("1000000000000")),
          trackerAcc.totalVetokens,
          typeof options.kind?.constant !== "undefined" ? 0 : 0.00000000001
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
        await vsrProgram.methods
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
        await vsrProgram.methods
          .resetLockupV0({
            kind: { constant: {} },
            periods: 365 * 4,
          })
          .accounts({
            position: position,
            positionAuthority: positionAuthorityKp.publicKey,
          })
          .signers([positionAuthorityKp])
          .rpc();
      });

      describe("with enrolled vehnt", () => {
        beforeEach(async () => {
          await program.methods
            .enrollV0()
            .accounts({
              position,
              vetokenTracker,
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
            vsrProgram.methods
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
            "AnchorError caused by account: source_position. Error Code: PositionFrozen. Error Number: 6060. Error Message: PositionFrozen."
          );
        });

        it("does not allow lockup resets", async () => {
          await expect(
            vsrProgram.methods
              .resetLockupV0({
                kind: { constant: {} },
                periods: 182 * 4,
              })
              .accounts({
                position: position,
                positionAuthority: positionAuthorityKp.publicKey,
              })
              .signers([positionAuthorityKp])
              .rpc()
          ).to.eventually.be.rejectedWith(
            "AnchorError caused by account: position. Error Code: PositionFrozen. Error Number: 6060. Error Message: PositionFrozen."
          );
        });

        it("allows closing enroll", async () => {
          await sleep(options.delay);
          const method = program.methods
            .unenrollV0()
            .accounts({
              position,
              vetokenTracker,
              positionAuthority: positionAuthorityKp.publicKey,
              rentRefund: me,
            })
            .signers([positionAuthorityKp]);

          const { enrolledPosition, vsrEpochInfo } = await method.pubkeys();
          await method.rpc({ skipPreflight: true });

          const sdAcc = await program.account.veTokenTrackerV0.fetch(vetokenTracker);

          expect(sdAcc.vetokenFallRate.toNumber()).to.eq(0);
          // Extremely precise u128 can be off by dust.
          expect(sdAcc.totalVetokens.toNumber()).to.be.closeTo(0, 15);

          assert.isFalse(
            !!(await provider.connection.getAccountInfo(enrolledPosition!))
          );
        });

        describe("with multiple enrolled vehnt", () => {
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
              .enrollV0()
              .accounts({
                position: basePosition,
                vetokenTracker,
                positionAuthority: positionAuthorityKp.publicKey,
              })
              .signers([positionAuthorityKp])
              .rpc({ skipPreflight: true });
          });

          it("enrolls proper vehnt amount", async () => {
            const sdAcc = await program.account.veTokenTrackerV0.fetch(vetokenTracker);

            const expectedVehnt =
              options.lockupAmount * options.expectedMultiplier +
              basePositionOptions.lockupAmount *
                basePositionOptions.expectedMultiplier;

            expectBnAccuracy(
              toBN(expectedVehnt, 8).mul(new BN("1000000000000")),
              sdAcc.totalVetokens,
              0.0000001
            );
          });

          it("allows closing enroll", async () => {
            const method = program.methods
              .unenrollV0()
              .accounts({
                position: basePosition,
                vetokenTracker,
                positionAuthority: positionAuthorityKp.publicKey,
                rentRefund: me,
              })
              .signers([positionAuthorityKp]);

            const { enrolledPosition } = await method.pubkeys();
            await method.rpc({ skipPreflight: true });

            const sdAcc = await program.account.veTokenTrackerV0.fetch(vetokenTracker);
            const positionAcc = await vsrProgram.account.positionV0.fetch(
              position
            );
            const endTs = positionAcc.lockup.endTs.toNumber();
            const startTs = positionAcc.lockup.startTs.toNumber();
            const multiplier =
              typeof positionAcc.lockup.kind.cliff === "undefined"
                ? 1
                : (endTs - sdAcc.vetokenLastCalculatedTs.toNumber()) /
                  (endTs - startTs);

            const expectedVehnt =
              options.lockupAmount * options.expectedMultiplier * multiplier;

            expectBnAccuracy(
              toBN(expectedVehnt, 8).mul(new BN("1000000000000")),
              sdAcc.totalVetokens,
              0.0000000001
            );

            expect(sdAcc.vetokenFallRate.toNumber()).to.be.closeTo(
              typeof positionAcc.lockup.kind.cliff !== "undefined"
                ? ((options.lockupAmount * options.expectedMultiplier) /
                    (endTs - startTs)) *
                    100000000000000000000
                : 0,
              1
            );

            assert.isFalse(
              !!(await provider.connection.getAccountInfo(enrolledPosition!))
            );
          });
        });

        describe("with calculated rewards", () => {
          let epoch: anchor.BN;
          let vsrEpochInfo: PublicKey;

          beforeEach(async () => {
            const offset = new BN(1 * 60 * 60 * 24);
            await vsrProgram.methods
              .setTimeOffsetV0(offset)
              .accounts({ registrar })
              .rpc({ skipPreflight: true });
            const unixTime = await getUnixTimestamp(provider)
            const time = offset.add(new BN(unixTime.toString()))
            epoch = currentEpoch(time);
          });

          it("claim rewards", async () => {
            // issue rewards
            await program.methods
              .rewardForEpochV0({
                epoch,
                amount: toBN(REWARDS, 8),
              })
              .accounts({
                vetokenTracker,
                registrar,
                vsrEpochInfo,
                rewardsPayer: me,
              })
              .rpc({ skipPreflight: true });

            const method = program.methods
              .claimRewardsV0({
                epoch,
              })
              .accounts({
                position,
                vetokenTracker,
                positionAuthority: positionAuthorityKp.publicKey,
              })
              .signers([positionAuthorityKp]);
            const { rewardsPool } = await method.pubkeys();
            await method.rpc({ skipPreflight: true });

            const postAtaBalance = AccountLayout.decode(
              (await provider.connection.getAccountInfo(rewardsPool!))?.data!
            ).amount;
            expect(Number(postAtaBalance)).to.be.within(0, 5000);
          });
        });
      });
    });
  });
})

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}