import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { VoterStakeRegistry } from "@helium/idls/lib/types/voter_stake_registry";
import { Proposal } from "@helium/modular-governance-idls/lib/types/proposal";
import { init as initProposal } from "@helium/proposal-sdk";
import {
  createAtaAndMint,
  createMint,
  createMintInstructions,
  sendInstructions,
  toBN,
  truthy,
} from "@helium/spl-utils";
import {
  GoverningTokenConfigAccountArgs,
  GoverningTokenType,
  MintMaxVoteWeightSource,
  getGovernanceProgramVersion,
  withCreateRealm,
  withSetRealmConfig,
} from "@solana/spl-governance";
import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import {
  PROGRAM_ID,
  init,
  positionKey,
  voteMarkerKey,
} from "../packages/voter-stake-registry-sdk/src";
import { expectBnAccuracy } from "./utils/expectBnAccuracy";
import { getUnixTimestamp, loadKeypair } from "./utils/solana";
import { random } from "./utils/string";
import { SPL_GOVERNANCE_PID } from "./utils/vsr";
import {
  PROGRAM_ID as DEL_PID,
  init as initNftDelegation,
  delegationKey,
} from "@helium/nft-delegation-sdk";
import { NftDelegation } from "@helium/modular-governance-idls/lib/types/nft_delegation";
import { ensureVSRIdl } from "./utils/fixtures";

chai.use(chaiAsPromised);

const SECS_PER_DAY = 86400;
const SECS_PER_YEAR = 365 * SECS_PER_DAY;
const MAX_LOCKUP = 4 * SECS_PER_YEAR;
const DIGIT_SHIFT = 0;
const BASELINE = 0;
const SCALE = 100;
const GENESIS_MULTIPLIER = 3;
type VotingMintConfig =
  anchor.IdlTypes<VoterStakeRegistry>["VotingMintConfigV0"];

describe("voter-stake-registry", () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  let program: Program<VoterStakeRegistry>;
  let delegateProgram: Program<NftDelegation>;
  let proposalProgram: Program<Proposal>;
  let registrar: PublicKey;
  let collection: PublicKey;
  let hntMint: PublicKey;
  let realm: PublicKey;
  let delegationConfig: PublicKey | undefined;
  let programVersion: number;
  let oneWeekFromNow: number;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;

  beforeEach(async () => {
    program = await init(
      provider,
      PROGRAM_ID,
      anchor.workspace.VoterStakeRegistry.idl
    );
    ensureVSRIdl(program);
    // @ts-ignore
    proposalProgram = await initProposal(provider as any);
    delegateProgram = await initNftDelegation(provider, DEL_PID);
    hntMint = await createMint(provider, 8, me, me);
    await createAtaAndMint(provider, hntMint, toBN(223_000_000, 8));

    programVersion = await getGovernanceProgramVersion(
      program.provider.connection,
      SPL_GOVERNANCE_PID
    );
    // Create Realm
    const name = `Realm-${new Keypair().publicKey.toBase58().slice(0, 6)}`;
    const realmAuthorityPk = me;
    let instructions: TransactionInstruction[] = [];
    realm = await withCreateRealm(
      instructions,
      SPL_GOVERNANCE_PID,
      programVersion,
      name,
      realmAuthorityPk,
      hntMint,
      me,
      undefined,
      MintMaxVoteWeightSource.FULL_SUPPLY_FRACTION,
      new anchor.BN(1)
    );

    await withSetRealmConfig(
      instructions,
      SPL_GOVERNANCE_PID,
      programVersion,
      realm,
      me,
      undefined,
      MintMaxVoteWeightSource.FULL_SUPPLY_FRACTION,
      new anchor.BN(1),
      new GoverningTokenConfigAccountArgs({
        voterWeightAddin: program.programId,
        maxVoterWeightAddin: undefined,
        tokenType: GoverningTokenType.Liquid,
      }),
      undefined,
      me
    );

    ({
      pubkeys: { delegationConfig },
    } = await delegateProgram.methods
      .initializeDelegationConfigV0({
        maxDelegationTime: new anchor.BN(1000000000000),
        name: random(10),
        seasons: [new anchor.BN(new Date().valueOf() / 1000 + 100000)],
      })
      .accounts({
        authority: me,
      })
      .rpcAndKeys());

    const {
      instruction: createRegistrar,
      pubkeys: { registrar: rkey, collection: ckey },
    } = await program.methods
      .initializeRegistrarV0({
        positionUpdateAuthority: null,
      })
      .accounts({
        realm: realm,
        realmGoverningTokenMint: hntMint,
        delegationConfig,
      })
      .prepare();
    registrar = rkey!;
    collection = ckey!;
    instructions.push(createRegistrar);

    // Configure voting mint
    oneWeekFromNow =
      Number(await getUnixTimestamp(provider)) + 60 * 60 * 24 * 7;
    instructions.push(
      await program.methods
        .configureVotingMintV0({
          idx: 0, // idx
          digitShift: DIGIT_SHIFT, // digit shift
          baselineVoteWeightScaledFactor: new anchor.BN(BASELINE * 1e9),
          maxExtraLockupVoteWeightScaledFactor: new anchor.BN(SCALE * 1e9),
          genesisVotePowerMultiplier: GENESIS_MULTIPLIER,
          genesisVotePowerMultiplierExpirationTs: new anchor.BN(oneWeekFromNow),
          lockupSaturationSecs: new anchor.BN(MAX_LOCKUP),
        })
        .accounts({
          registrar,
          mint: hntMint,
        })
        .remainingAccounts([
          {
            pubkey: hntMint,
            isSigner: false,
            isWritable: false,
          },
        ])
        .instruction()
    );

    await sendInstructions(provider, instructions, []);
  });

  async function createAndDeposit(
    lockupAmount: number,
    periods: number,
    kind: any = { cliff: {} },
    owner?: Keypair
  ): Promise<{ mint: PublicKey; position: PublicKey }> {
    const mintKeypair = Keypair.generate();
    const position = positionKey(mintKeypair.publicKey)[0];
    const instructions: TransactionInstruction[] = [];
    instructions.push(
      ...(await createMintInstructions(
        provider,
        0,
        position,
        position,
        mintKeypair
      ))
    );
    instructions.push(
      await program.methods
        .initializePositionV0({
          kind,
          periods,
        })
        .accounts({
          // lock for 6 months
          collection,
          registrar,
          mint: mintKeypair.publicKey,
          depositMint: hntMint,
          recipient: owner?.publicKey,
        })
        .instruction()
    );

    // deposit some hnt
    instructions.push(
      await program.methods
        .depositV0({ amount: toBN(lockupAmount, 8) })
        .accounts({
          registrar,
          position,
          mint: hntMint,
        })
        .instruction()
    );
    await sendInstructions(
      provider,
      instructions,
      [mintKeypair].filter(truthy)
    );

    return { position, mint: mintKeypair.publicKey };
  }

  it("should create a maxVoterWeightRecord correctly", async () => {
    const instructions: TransactionInstruction[] = [];

    const {
      pubkeys: { maxVoterWeightRecord },
      instruction,
    } = await program.methods
      .updateMaxVoterWeightV0()
      .accounts({
        registrar,
      })
      .prepare();
    instructions.push(instruction);

    await sendInstructions(provider, instructions, []);
    const maxVoterWeightAcc = await program.account.maxVoterWeightRecord.fetch(
      maxVoterWeightRecord!
    );

    expectBnAccuracy(
      toBN(223_000_000 * SCALE * GENESIS_MULTIPLIER, 8),
      maxVoterWeightAcc.maxVoterWeight,
      0.00001
    );
  });

  it("should configure a votingMint correctly", async () => {
    const registrarAcc = await program.account.registrar.fetch(registrar);
    console.log(registrarAcc.collection.toBase58());
    const votingMint0 = (
      registrarAcc.votingMints as VotingMintConfig[]
    )[0] as VotingMintConfig;

    expect(votingMint0.digitShift).to.eq(DIGIT_SHIFT);
    expect(
      votingMint0.baselineVoteWeightScaledFactor.eq(
        new anchor.BN(BASELINE * 1e9)
      )
    ).to.eq(true);
    expect(
      votingMint0.maxExtraLockupVoteWeightScaledFactor.eq(
        new anchor.BN(SCALE * 1e9)
      )
    ).to.eq(true);
    expect(votingMint0.genesisVotePowerMultiplier).to.eq(GENESIS_MULTIPLIER);
    expect(
      votingMint0.genesisVotePowerMultiplierExpirationTs.eq(
        new anchor.BN(oneWeekFromNow)
      )
    ).to.eq(true);
    expect(
      votingMint0.lockupSaturationSecs.eq(new anchor.BN(MAX_LOCKUP))
    ).to.eq(true);
  });

  it("should allow me to create a position and deposit tokens", async () => {
    const { mint, position } = await createAndDeposit(10, 183);
    const positionAccount = await program.account.positionV0.fetch(position);

    expect(positionAccount.amountDepositedNative.toNumber()).to.eq(
      toBN(10, 8).toNumber()
    );
    expect(positionAccount.mint.toBase58()).to.eq(mint.toBase58());
    expect(positionAccount.registrar.toBase58()).to.eq(registrar.toBase58());
    expect(positionAccount.numActiveVotes).to.eq(0);

    const bal = await provider.connection.getTokenAccountBalance(
      await getAssociatedTokenAddress(mint, me)
    );
    expect(bal.value.uiAmount).to.eq(1);
  });

  describe("with proposal", async () => {
    let proposalConfig: PublicKey | undefined;
    let proposal: PublicKey | undefined;
    let name: string;
    beforeEach(async () => {
      name = random();
      ({
        pubkeys: { proposalConfig },
      } = await proposalProgram.methods
        .initializeProposalConfigV0({
          name,
          voteController: registrar,
          stateController: me,
          onVoteHook: PublicKey.default,
        })
        .rpcAndKeys());
      ({
        pubkeys: { proposal },
      } = await proposalProgram.methods
        .initializeProposalV0({
          seed: Buffer.from(name, "utf-8"),
          maxChoicesPerVoter: 1,
          name,
          uri: "https://example.com",
          choices: [
            {
              name: "Yes",
              uri: null,
            },
            {
              name: "No",
              uri: null,
            },
          ],
          tags: ["test", "tags"],
        })
        .accounts({ proposalConfig })
        .rpcAndKeys());

      await proposalProgram.methods
        .updateStateV0({
          newState: {
            voting: {
              startTs: new anchor.BN(new Date().valueOf() / 1000),
            } as any,
          },
        })
        .accounts({ proposal })
        .rpc({ skipPreflight: true });
    });

    const applyDigitShift = (amountNative: number, digitShift: number) => {
      let val = 0;

      if (digitShift < 0) {
        val = amountNative / 10 ** digitShift;
      } else {
        val = amountNative * 10 ** digitShift;
      }

      return val;
    };

    let voteTestCases = [
      {
        name: "genesis constant 1 position (within genesis)",
        delay: 0, // days
        fastForward: 60, // days
        positions: [
          {
            lockupAmount: 10000,
            periods: 200,
            kind: { constant: {} },
          },
        ],
        expectedVeHnt:
          applyDigitShift(10000, DIGIT_SHIFT) *
          (GENESIS_MULTIPLIER || 1) *
          (BASELINE + Math.min((SECS_PER_DAY * 200) / MAX_LOCKUP, 1) * SCALE),
      },
      {
        name: "genesis cliff 1 position (within genesis)",
        delay: 0, // days
        fastForward: 60, // days
        positions: [
          {
            lockupAmount: 10000,
            periods: 200,
            kind: { cliff: {} },
          },
        ],
        expectedVeHnt:
          applyDigitShift(10000, DIGIT_SHIFT) *
          (GENESIS_MULTIPLIER || 1) *
          (BASELINE +
            Math.min((SECS_PER_DAY * (200 - 60)) / MAX_LOCKUP, 1) * SCALE),
      },
      {
        name: "constant 1 positon (outside of genesis)",
        delay: 0, // days
        fastForward: 201, // days
        positions: [
          {
            lockupAmount: 10000,
            periods: 200,
            kind: { constant: {} },
          },
        ],
        expectedVeHnt:
          applyDigitShift(10000, DIGIT_SHIFT) *
          (BASELINE + Math.min((SECS_PER_DAY * 200) / MAX_LOCKUP, 1) * SCALE),
      },
      {
        name: "cliff 1 position (outside genesis)",
        delay: 7, // days
        fastForward: 60, // days
        positions: [
          {
            lockupAmount: 10000,
            periods: 200,
            kind: { cliff: {} },
          },
        ],
        expectedVeHnt:
          applyDigitShift(10000, DIGIT_SHIFT) *
          (BASELINE +
            Math.min((SECS_PER_DAY * (200 - 60)) / MAX_LOCKUP, 1) * SCALE),
      },
    ];
    voteTestCases.forEach((testCase) => {
      const depositor = Keypair.generate();
      it("should allow me to vote with " + testCase.name, async () => {
        await program.methods
          .setTimeOffsetV0(new anchor.BN(testCase.delay * SECS_PER_DAY))
          .accounts({ registrar })
          .rpc();

        const instructions: TransactionInstruction[] = [];
        const positions: { position: PublicKey; mint: PublicKey }[] =
          await Promise.all(
            testCase.positions.map((position) =>
              createAndDeposit(
                position.lockupAmount,
                position.periods,
                position.kind,
                depositor
              )
            )
          );

        await program.methods
          .setTimeOffsetV0(
            new anchor.BN(
              (testCase.delay + testCase.fastForward) * SECS_PER_DAY
            )
          )
          .accounts({ registrar })
          .rpc();

        const voteIxs = await Promise.all(
          positions.map(
            async (position) =>
              await program.methods
                .voteV0({
                  choice: 0,
                })
                .accounts({
                  registrar,
                  proposal,
                  voter: depositor.publicKey,
                  position: position.position,
                })
                .instruction()
          )
        );
        instructions.push(...voteIxs);

        await sendInstructions(provider, instructions, [depositor]);
        const acc = await proposalProgram.account.proposalV0.fetch(proposal!);
        expectBnAccuracy(
          toBN(testCase.expectedVeHnt, 8),
          acc.choices[0].weight,
          0.00001
        );
      });
    });

    describe("with delegation", async () => {
      let delegatee = Keypair.generate();
      let position: PublicKey;
      let mint: PublicKey;

      beforeEach(async () => {
        ({ position, mint } = await createAndDeposit(10000, 200));
        await delegateProgram.methods
          .delegateV0({
            expirationTime: new anchor.BN(new Date().valueOf() / 1000 + 10000),
          })
          .accounts({
            delegationConfig,
            asset: mint,
            recipient: delegatee.publicKey,
          })
          .rpc({ skipPreflight: true });
      });

      it("allows voting on and relinquishing votes on the proposal", async () => {
        const {
          pubkeys: { marker },
        } = await program.methods
          .delegatedVoteV0({
            choice: 0,
          })
          .accounts({
            mint,
            proposal,
            position,
            owner: delegatee.publicKey,
          })
          .signers([delegatee])
          .rpcAndKeys({ skipPreflight: true });

        let acct = await proposalProgram.account.proposalV0.fetch(proposal!);
        expect(acct.choices[0].weight.toNumber()).to.be.gt(0);
        let markerA = await program.account.voteMarkerV0.fetchNullable(
          marker! as PublicKey
        );
        expect(markerA?.choices).to.deep.eq([0]);

        await program.methods
          .delegatedRelinquishVoteV0({
            choice: 0,
          })
          .accounts({
            mint,
            proposal,
            position,
            owner: delegatee.publicKey,
          })
          .signers([delegatee])
          .rpc({ skipPreflight: true });

        acct = await proposalProgram.account.proposalV0.fetch(proposal!);
        expect(acct.choices[0].weight.toNumber()).to.eq(0);
        markerA = await program.account.voteMarkerV0.fetchNullable(
          marker! as PublicKey
        );
        expect(markerA).to.be.null;
      });

      it("allows earlier delegates to change the vote", async () => {
        const {
          pubkeys: { marker },
        } = await program.methods
          .delegatedVoteV0({
            choice: 0,
          })
          .accounts({
            mint,
            proposal,
            position,
            owner: delegatee.publicKey,
          })
          .signers([delegatee])
          .rpcAndKeys({ skipPreflight: true });

        let acct = await proposalProgram.account.proposalV0.fetch(proposal!);
        expect(acct.choices[0].weight.toNumber()).to.be.gt(0);
        let markerA = await program.account.voteMarkerV0.fetchNullable(
          marker! as PublicKey
        );
        expect(markerA?.choices).to.deep.eq([0]);
        expect(markerA?.delegationIndex).to.eq(1);

        await program.methods
          .relinquishVoteV1({
            choice: 0,
          })
          .accounts({
            mint,
            proposal,
            position,
          })
          .rpc({ skipPreflight: true });

        acct = await proposalProgram.account.proposalV0.fetch(proposal!);
        expect(acct.choices[0].weight.toNumber()).to.eq(0);
        markerA = await program.account.voteMarkerV0.fetchNullable(
          marker! as PublicKey
        );
        expect(markerA).to.be.null;

        await program.methods
          .voteV0({
            choice: 1,
          })
          .accounts({
            mint,
            proposal,
            position,
          })
          .rpcAndKeys({ skipPreflight: true });

        acct = await proposalProgram.account.proposalV0.fetch(proposal!);
        expect(acct.choices[1].weight.toNumber()).to.be.gt(0);
        markerA = await program.account.voteMarkerV0.fetchNullable(
          marker! as PublicKey
        );
        expect(markerA?.choices).to.deep.eq([1]);
        expect(markerA?.delegationIndex).to.eq(0);
      });

      it("allows the original owner to undelegate", async () => {
        const toUndelegate = delegationKey(delegationConfig!, mint, delegatee.publicKey)[0];
        const myDelegation = delegationKey(delegationConfig!, mint, PublicKey.default)[0];
        await delegateProgram.methods
          .undelegateV0()
          .accounts({
            delegation: toUndelegate,
            prevDelegation: myDelegation,
            currentDelegation: myDelegation,
          })
          .rpc({ skipPreflight: true });

        expect(
          (
            await delegateProgram.account.delegationV0.fetch(myDelegation)
          ).nextOwner.toBase58()
        ).to.eq(PublicKey.default.toBase58());
        expect(
          await delegateProgram.account.delegationV0.fetchNullable(toUndelegate)
        ).to.be.null;
      });
    });

    describe("with an active vote", async () => {
      let position: PublicKey;
      let mint: PublicKey;
      let tokenOwnerRecord: PublicKey;
      let voteRecord: PublicKey;
      let voterWeightRecord: PublicKey;

      beforeEach(async () => {
        ({ position, mint } = await createAndDeposit(10000, 200));

        await program.methods
          .voteV0({
            choice: 0,
          })
          .accounts({
            registrar,
            proposal,
            position,
          })
          .rpc({ skipPreflight: true });
      });

      it("should not allow me to vote twice", async () => {
        try {
          await program.methods
            .voteV0({
              choice: 0,
            })
            .accounts({
              registrar,
              proposal,
              position,
            })
            .rpc({ skipPreflight: true });
        } catch (e: any) {
          expect(e.code).to.eq(6044);
        }
      });

      it("doesn't allow transferring", async () => {
        const voter = Keypair.generate();
        const instructions: TransactionInstruction[] = [];
        instructions.push(
          createAssociatedTokenAccountInstruction(
            me,
            await getAssociatedTokenAddress(mint, voter.publicKey),
            voter.publicKey,
            mint
          ),
          await createTransferInstruction(
            await getAssociatedTokenAddress(mint, me),
            await getAssociatedTokenAddress(mint, voter.publicKey),
            me,
            1
          )
        );

        try {
          await sendInstructions(provider, instructions);
        } catch (e: any) {
          console.log(e);
          expect(e.InstructionError[1].Custom).to.eq(17);
        }
      });

      it("should allow me to relinquish my vote", async () => {
        const instructions: TransactionInstruction[] = [];
        instructions.push(
          await program.methods
            .relinquishVoteV1({
              choice: 0,
            })
            .accounts({
              proposal,
              position,
            })
            .instruction()
        );
        await sendInstructions(provider, instructions);
        const positionAcc = await program.account.positionV0.fetch(position);
        expect(positionAcc.numActiveVotes).to.equal(0);
      });

      it("should not allow me to move tokens to another position while vote is active", async () => {
        const { position: newPos } = await createAndDeposit(10, 185);
        await expect(
          program.methods
            .transferV0({ amount: toBN(10, 8) })
            .accounts({
              sourcePosition: position,
              targetPosition: newPos,
              depositMint: hntMint,
            })
            .rpc()
        ).to.eventually.be.rejectedWith(
          "AnchorError caused by account: source_position. Error Code: ActiveVotesExist. Error Number: 6055. Error Message: Cannot change a position while active votes exist."
        );
      });
    });
  });

  describe("with position", async () => {
    let position: PublicKey;

    beforeEach(async () => {
      ({ position } = await createAndDeposit(100, 184));
    });

    it("should allow me to withdraw and close a position after lockup", async () => {
      await program.methods
        .setTimeOffsetV0(new anchor.BN(185 * SECS_PER_DAY))
        .accounts({ registrar })
        .rpc({ skipPreflight: true });

      await program.methods
        .withdrawV0({ amount: toBN(100, 8) })
        .accounts({ position, depositMint: hntMint })
        .rpc({ skipPreflight: true });

      const positionAccount = await program.account.positionV0.fetch(position);
      expect(positionAccount.amountDepositedNative.toNumber()).to.equal(0);

      await program.methods.closePositionV0().accounts({ position }).rpc();
      expect(await program.account.positionV0.fetchNullable(position)).to.be
        .null;
    });

    it("allows transfers for ledger users", async () => {
      const approver = loadKeypair(__dirname + "/keypairs/approver-test.json");
      const to = Keypair.generate();

      const positionAccount = await program.account.positionV0.fetch(position);
      const mint = positionAccount.mint;

      await program.methods
        .ledgerTransferPositionV0()
        .accounts({
          to: to.publicKey,
          position,
          mint,
          approver: approver.publicKey,
        })
        .signers([approver, to])
        .rpc({ skipPreflight: true });

      const toBalance = await provider.connection.getTokenAccountBalance(
        getAssociatedTokenAddressSync(mint, to.publicKey)
      );
      expect(toBalance.value.uiAmount).to.equal(1);
    });

    it("should not allow me to withdraw a position before lockup", async () => {
      await expect(
        program.methods
          .withdrawV0({ amount: toBN(100, 8) })
          .accounts({ position, depositMint: hntMint })
          .rpc()
      ).to.be.rejected;
    });

    it("should allow me to extend my lockup", async () => {
      await program.methods
        .resetLockupV0({
          kind: { constant: {} },
          periods: 185,
        })
        .accounts({
          position,
        })
        .rpc({ skipPreflight: true });

      const positionAcc = await program.account.positionV0.fetch(position);
      expect(Boolean(positionAcc.lockup.kind.constant)).to.be.true;
      expect(
        positionAcc.lockup.endTs.sub(positionAcc.lockup.startTs).toNumber()
      ).to.equal(185 * SECS_PER_DAY);
    });

    it("should allow me to move tokens to a position with a greater or equal lockup", async () => {
      const { position: newPos } = await createAndDeposit(10, 185);
      await program.methods
        .transferV0({ amount: toBN(10, 8) })
        .accounts({
          sourcePosition: position,
          targetPosition: newPos,
          depositMint: hntMint,
        })
        .rpc({ skipPreflight: true });

      const newPosAcc = await program.account.positionV0.fetch(newPos);
      const oldPosAcc = await program.account.positionV0.fetch(position);
      expect(newPosAcc.amountDepositedNative.toNumber()).to.equal(
        toBN(20, 8).toNumber()
      );
      expect(oldPosAcc.amountDepositedNative.toNumber()).to.equal(
        toBN(90, 8).toNumber()
      );
    });
  });
});
