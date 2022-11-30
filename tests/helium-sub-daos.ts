import { init as cbInit } from "@helium/circuit-breaker-sdk";
import { CircuitBreaker } from "@helium/idls/lib/types/circuit_breaker";
import { HeliumSubDaos } from "@helium/idls/lib/types/helium_sub_daos";
import { sendInstructions, toBN } from "@helium/spl-utils";
import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { AccountLayout } from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram
} from "@solana/web3.js";
import { AggregatorAccount, loadSwitchboardProgram } from "@switchboard-xyz/switchboard-v2";
import { expect } from "chai";
import { init as dcInit } from "../packages/data-credits-sdk/src";
import { init as issuerInit } from "../packages/helium-entity-manager-sdk/src";
import { heliumSubDaosResolvers } from "../packages/helium-sub-daos-sdk/src";
import { DataCredits } from "../target/types/data_credits";
import { HeliumEntityManager } from "../target/types/helium_entity_manager";
import { burnDataCredits } from "./data-credits";
import { initTestDao, initTestSubdao } from "./utils/daos";
import { ensureDCIdl, ensureHSDIdl, initWorld } from "./utils/fixtures";

const EPOCH_REWARDS = 100000000;
const SUB_DAO_EPOCH_REWARDS = 10000000;

describe("helium-sub-daos", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  const program = new Program<HeliumSubDaos>(
    anchor.workspace.HeliumSubDaos.idl,
    anchor.workspace.HeliumSubDaos.programId,
    anchor.workspace.HeliumSubDaos.provider,
    anchor.workspace.HeliumSubDaos.coder,
    () => {
      return heliumSubDaosResolvers;
    }
  );

  let dcProgram: Program<DataCredits>;
  let hemProgram: Program<HeliumEntityManager>;
  let cbProgram: Program<CircuitBreaker>;

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;

  before(async () => {
    dcProgram = await dcInit(
      provider,
      anchor.workspace.DataCredits.programId,
      anchor.workspace.DataCredits.idl
    );
    cbProgram = await cbInit(
      provider,
      anchor.workspace.CircuitBreaker.programId,
      anchor.workspace.CircuitBreaker.idl
    );
    ensureDCIdl(dcProgram);
    ensureHSDIdl(program);
    hemProgram = await issuerInit(
      provider,
      anchor.workspace.HeliumEntityManager.programId,
      anchor.workspace.HeliumEntityManager.idl
    );
  });

  it("initializes a dao", async () => {
    const { dao, mint } = await initTestDao(program, provider, EPOCH_REWARDS, provider.wallet.publicKey);
    const account = await program.account.daoV0.fetch(dao!);
    expect(account.authority.toBase58()).eq(me.toBase58());
    expect(account.hntMint.toBase58()).eq(mint.toBase58());
  });

  it("initializes a subdao", async () => {
    const { dao } = await initTestDao(program, provider, EPOCH_REWARDS, provider.wallet.publicKey);
    const { subDao, treasury, mint, treasuryCircuitBreaker } =
      await initTestSubdao(
        program,
        provider,
        provider.wallet.publicKey,
        dao,
      );

    const account = await program.account.subDaoV0.fetch(subDao!);
    const breaker = await cbProgram.account.accountWindowedCircuitBreakerV0.fetch(treasuryCircuitBreaker);

    // @ts-ignore
    expect(Boolean(breaker.config.thresholdType.absolute)).to.be.true;

    expect(account.authority.toBase58()).eq(me.toBase58());
    expect(account.treasury.toBase58()).eq(treasury.toBase58());
    expect(account.dntMint.toBase58()).eq(mint.toBase58());
  });

  describe("with dao and subdao", () => {
    let dao: PublicKey;
    let subDao: PublicKey;
    let hotspotIssuer: PublicKey;
    let treasury: PublicKey;
    let dcMint: PublicKey;
    let rewardsEscrow: PublicKey;
    let makerKeypair: Keypair;

    async function burnDc(
      amount: number
    ): Promise<{ subDaoEpochInfo: PublicKey }> {
      await dcProgram.methods
        .mintDataCreditsV0({
          hntAmount: toBN(amount, 8),
        })
        .accounts({ dcMint })
        .rpc({ skipPreflight: true });

      await sendInstructions(provider, [
        SystemProgram.transfer({
          fromPubkey: me,
          toPubkey: PublicKey.findProgramAddressSync(
            [Buffer.from("account_payer", "utf8")],
            dcProgram.programId
          )[0],
          lamports: 100000000,
        }),
      ]);

      return burnDataCredits({
        program: dcProgram,
        subDao,
        amount,
      });
    }

    beforeEach(async () => {
      ({
        dataCredits: { dcMint },
        subDao: { subDao, treasury, rewardsEscrow },
        dao: { dao },
        issuer: { makerKeypair, hotspotIssuer },
      } = await initWorld(
        provider,
        hemProgram,
        program,
        dcProgram,
        EPOCH_REWARDS,
        SUB_DAO_EPOCH_REWARDS
      ));
    });

    it("allows tracking dc spend", async () => {
      const { subDaoEpochInfo } = await burnDc(10);

      const epochInfo = await program.account.subDaoEpochInfoV0.fetch(
        subDaoEpochInfo
      );
      
      expect(epochInfo.dcBurned.toNumber()).eq(toBN(10, 0).toNumber());
    });

    it("calculates subdao rewards", async () => {
      const { subDaoEpochInfo } = await burnDc(1600000);
      const epoch = (
        await program.account.subDaoEpochInfoV0.fetch(subDaoEpochInfo)
      ).epoch;

      const aggregator = new AggregatorAccount({
        program: await loadSwitchboardProgram(
          "mainnet-beta",
          provider.connection,
          Keypair.fromSeed(new Uint8Array(32).fill(1)) // using dummy keypair since we wont be submitting any transactions
        ),
        publicKey: new PublicKey(
          "GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR"
        ),
      });
      const history = await aggregator.loadHistory();
      const epochTs = epoch.toNumber() * 24 * 60 * 60;
      const currHistory = history
        .reverse()
        .find((h) => h.timestamp.toNumber() <= epochTs);
      // Remove the . since right now we're just cloning eth price feed
      const currentActiveDeviceCount = Number(
        currHistory?.value.toNumber().toString().replace(".", "")
      );
      console.log(currentActiveDeviceCount);

      const instr = await program.methods
        .calculateUtilityScoreV0({
          epoch,
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 350000 }),
        ])
        .accounts({
          subDao,
          dao,
        });


      const pubkeys = await instr.pubkeys();
      await instr.rpc({ skipPreflight: true });

      const subDaoInfo = await program.account.subDaoEpochInfoV0.fetch(
        subDaoEpochInfo
      );
      const daoInfo = await program.account.daoEpochInfoV0.fetch(
        pubkeys.daoEpochInfo!
      );

      expect(daoInfo.numUtilityScoresCalculated).to.eq(1);

      // sqrt(active devices * 50) * 4th_root(dc burned)
      const totalUtility = Math.sqrt(currentActiveDeviceCount * 50) * Math.pow(16, 1/4);
      const utility = twelveDecimalsToNumber(daoInfo.totalUtilityScore);

      console.log(
        utility,
        twelveDecimalsToNumber(subDaoInfo.utilityScore!),
        totalUtility,
        subDaoInfo.dcBurned.toNumber()
      );
      expect(utility).to.eq(totalUtility);
      expect(twelveDecimalsToNumber(subDaoInfo.utilityScore!)).to.eq(
        totalUtility
      );
    });

    describe("with calculated rewards", () => {
      let epoch: anchor.BN;

      beforeEach(async () => {
        const { subDaoEpochInfo } = await burnDc(1600000);
        epoch = (await program.account.subDaoEpochInfoV0.fetch(subDaoEpochInfo))
          .epoch;
        await program.methods
          .calculateUtilityScoreV0({
            epoch,
          })
          .preInstructions([
            ComputeBudgetProgram.setComputeUnitLimit({ units: 350000 }),
          ])
          .accounts({
            subDao,
            dao,
          })
          .rpc({ skipPreflight: true });
      });

      it("issues hnt rewards to subdaos and dnt to rewards escrow", async () => {
        const preBalance = AccountLayout.decode(
          (await provider.connection.getAccountInfo(treasury))?.data!
        ).amount;
        const preMobileBalance = AccountLayout.decode(
          (await provider.connection.getAccountInfo(rewardsEscrow))?.data!
        ).amount;
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

        const postBalance = AccountLayout.decode(
          (await provider.connection.getAccountInfo(treasury))?.data!
        ).amount;
        const postMobileBalance = AccountLayout.decode(
          (await provider.connection.getAccountInfo(rewardsEscrow))?.data!
        ).amount;
        expect((postBalance - preBalance).toString()).to.eq(
          EPOCH_REWARDS.toString()
        );
        expect((postMobileBalance - preMobileBalance).toString()).to.eq(
          SUB_DAO_EPOCH_REWARDS.toString()
        );
      });
    });
  });
});
function twelveDecimalsToNumber(totalUtilityScore: anchor.BN) {
  const utilityStr = totalUtilityScore.toString()
  // format utility with 12 decimals
  const utility = Number(
    `${utilityStr.slice(0, utilityStr.length - 12)}.${utilityStr.slice(
      utilityStr.length - 12,
      utilityStr.length
    )}`
  );
  return utility;
}

