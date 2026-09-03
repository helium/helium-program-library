import { EPOCH_LENGTH } from "@helium/helium-sub-daos-sdk";
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import { expect } from "chai";
import { describe, it } from "mocha";
import { buildClaimInstructions } from "../../src/server/api/routers/governance/procedures/helpers/build-claim-instructions";

const NOOP_PROGRAM = Keypair.generate().publicKey;
const DAO = Keypair.generate().publicKey;
const DNT_MINT = Keypair.generate().publicKey;
const HNT_MINT = Keypair.generate().publicKey;
const DELEGATOR_POOL = Keypair.generate().publicKey;
const WALLET = Keypair.generate().publicKey;

/** An epoch far enough along that a full 128-epoch bitmap window fits behind it. */
const CURRENT_EPOCH = 20500;
const UNIX_NOW = CURRENT_EPOCH * EPOCH_LENGTH;

const clockAccount = () => {
  const data = Buffer.alloc(40);
  data.writeBigInt64LE(BigInt(UNIX_NOW), 8 * 4);
  return { data };
};

/**
 * Records how many `getMultipleAccountsInfo` calls are in flight at once. Each
 * call parks on a macrotask before answering, so a caller that awaits one chunk
 * before asking for the next never gets past one.
 */
const makeCountingConnection = () => {
  const state = { calls: 0, maxInFlight: 0, inFlight: 0 };

  const connection = {
    getAccountInfo: async () => clockAccount(),
    getMultipleAccountsInfo: async (keys: PublicKey[]) => {
      state.calls++;
      state.inFlight++;
      state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      state.inFlight--;
      return keys.map(() => ({ data: Buffer.alloc(0) }));
    },
  } as unknown as Connection;

  return { connection, state };
};

const stubHsdProgram = () =>
  ({
    account: {
      subDaoV0: {
        fetch: async () => ({
          dao: DAO,
          dntMint: DNT_MINT,
          delegatorPool: DELEGATOR_POOL,
        }),
      },
      daoV0: {
        fetch: async () => ({
          hntMint: HNT_MINT,
          delegatorPool: DELEGATOR_POOL,
        }),
      },
    },
    coder: {
      accounts: {
        decode: () => ({
          rewardsIssuedAt: new BN(UNIX_NOW),
          hntRewardsIssued: new BN(0),
        }),
      },
    },
    methods: {
      claimRewardsV0: () => ({
        accountsStrict: () => ({
          instruction: async () =>
            new TransactionInstruction({
              programId: NOOP_PROGRAM,
              keys: [],
              data: Buffer.alloc(0),
            }),
        }),
      }),
    },
  }) as unknown as Parameters<typeof buildClaimInstructions>[0]["hsdProgram"];

/**
 * A delegated position whose whole bitmap window is unclaimed, so it
 * contributes a full 128 epochs (one instruction batch) on its own.
 */
const positionWithFullWindow = (subDao: PublicKey) => {
  const mint = Keypair.generate().publicKey;
  return {
    mint,
    pubkey: Keypair.generate().publicKey,
    account: {
      lockup: { kind: { constant: {} }, endTs: new BN(0) },
      registrar: Keypair.generate().publicKey,
    },
    delegatedPositionKey: Keypair.generate().publicKey,
    delegatedPosition: {
      subDao,
      lastClaimedEpoch: new BN(CURRENT_EPOCH - 129),
      claimedEpochsBitmap: new BN(0),
      expirationTs: new BN(0),
    },
  };
};

describe("buildClaimInstructions epoch-info fetching", () => {
  it("fetches every epoch-info chunk concurrently", async () => {
    // #given two positions with a full unclaimed window each, which is more
    // epochs than one instruction batch holds
    const subDao = Keypair.generate().publicKey;
    const { connection, state } = makeCountingConnection();

    // #when the claim instructions are built
    const result = await buildClaimInstructions({
      positions: [
        positionWithFullWindow(subDao),
        positionWithFullWindow(subDao),
      ],
      walletPubkey: WALLET,
      connection,
      hsdProgram: stubHsdProgram(),
    });

    // #then the epochs span more than one batch, and every epoch-info read was
    // outstanding at the same time rather than one chunk after another
    expect(result.instructionBatches.length).to.be.greaterThan(1);
    expect(state.calls).to.be.greaterThan(1);
    expect(
      state.maxInFlight,
      "epoch-info chunks were fetched one after another",
    ).to.equal(state.calls);
  });
});
