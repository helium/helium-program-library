import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import { describe, it } from "mocha";
import { RENT_COSTS } from "../../src/lib/utils/balance-validation";
import {
  getAutomationRentLamports,
  getMissingEpochInfoRentLamports,
} from "../../src/server/api/routers/governance/procedures/helpers/rent";

const wallet = Keypair.generate().publicKey;

const stubConnection = (opts: {
  rentBySpace?: (space: number) => number;
  accountExists?: boolean;
  onRentRequest?: (space: number) => void;
}): Connection =>
  ({
    getMinimumBalanceForRentExemption: async (space: number) => {
      opts.onRentRequest?.(space);
      return opts.rentBySpace?.(space) ?? 0;
    },
    getAccountInfo: async () => (opts.accountExists ? { lamports: 1 } : null),
  }) as unknown as Connection;

describe("getAutomationRentLamports", () => {
  it("sizes claim-bot rent from the space the program allocates", async () => {
    // init_delegation_claim_bot_v0 declares `8 + 60 + INIT_SPACE`, and
    // DelegationClaimBotV0::INIT_SPACE is 138 bytes.
    const requestedSpaces: number[] = [];
    const connection = stubConnection({
      rentBySpace: () => 2_324_640,
      accountExists: true,
      onRentRequest: (space) => requestedSpaces.push(space),
    });

    const rent = await getAutomationRentLamports({
      connection,
      walletPubkey: wallet,
      newClaimBots: 1,
      createsHntAta: false,
    });

    expect(requestedSpaces).to.deep.equal([206]);
    expect(rent).to.equal(2_324_640);
  });

  it("counts the delegator HNT ATA when it does not exist yet", async () => {
    const connection = stubConnection({
      rentBySpace: () => 2_324_640,
      accountExists: false,
    });

    const rent = await getAutomationRentLamports({
      connection,
      walletPubkey: wallet,
      newClaimBots: 1,
      createsHntAta: true,
    });

    expect(rent).to.equal(2_324_640 + RENT_COSTS.ATA);
  });

  it("skips the HNT ATA rent when the account already exists", async () => {
    const connection = stubConnection({
      rentBySpace: () => 2_324_640,
      accountExists: true,
    });

    const rent = await getAutomationRentLamports({
      connection,
      walletPubkey: wallet,
      newClaimBots: 1,
      createsHntAta: true,
    });

    expect(rent).to.equal(2_324_640);
  });

  it("charges claim-bot rent once per position that still needs one", async () => {
    const connection = stubConnection({
      rentBySpace: () => 2_324_640,
      accountExists: true,
    });

    const rent = await getAutomationRentLamports({
      connection,
      walletPubkey: wallet,
      newClaimBots: 3,
      createsHntAta: false,
    });

    expect(rent).to.equal(3 * 2_324_640);
  });

  it("makes no RPC calls when nothing new is funded", async () => {
    let calls = 0;
    const connection = {
      getMinimumBalanceForRentExemption: async () => {
        calls++;
        return 2_324_640;
      },
      getAccountInfo: async () => {
        calls++;
        return null;
      },
    } as unknown as Connection;

    const rent = await getAutomationRentLamports({
      connection,
      walletPubkey: wallet,
      newClaimBots: 0,
      createsHntAta: false,
    });

    expect(rent).to.equal(0);
    expect(calls).to.equal(0);
  });
});

describe("getMissingEpochInfoRentLamports", () => {
  const epochRent = 2_310_720;

  const epochConnection = (present: boolean[]): Connection =>
    ({
      getMultipleAccountsInfo: async () =>
        present.map((exists) => (exists ? { lamports: 1 } : null)),
      getMinimumBalanceForRentExemption: async (space: number) => {
        expect(space).to.equal(204);
        return epochRent;
      },
    }) as unknown as Connection;

  it("charges only for the epoch-info accounts that do not exist yet", async () => {
    const rent = await getMissingEpochInfoRentLamports({
      connection: epochConnection([true, false]),
      epochInfoKeys: [
        Keypair.generate().publicKey,
        Keypair.generate().publicKey,
      ],
    });

    expect(rent).to.equal(epochRent);
  });

  it("charges nothing when both already exist", async () => {
    const rent = await getMissingEpochInfoRentLamports({
      connection: epochConnection([true, true]),
      epochInfoKeys: [
        Keypair.generate().publicKey,
        Keypair.generate().publicKey,
      ],
    });

    expect(rent).to.equal(0);
  });

  it("splits the existence read into chunks the RPC accepts", async () => {
    // getMultipleAccounts rejects more than 100 keys with "Too many inputs
    // provided", which a change-delegation of 50+ positions reaches.
    const requestedSizes: number[] = [];
    const connection = {
      getMultipleAccountsInfo: async (keys: PublicKey[]) => {
        requestedSizes.push(keys.length);
        return keys.map(() => null);
      },
      getMinimumBalanceForRentExemption: async () => epochRent,
    } as unknown as Connection;

    const rent = await getMissingEpochInfoRentLamports({
      connection,
      epochInfoKeys: Array.from(
        { length: 150 },
        () => Keypair.generate().publicKey,
      ),
    });

    expect(requestedSizes).to.deep.equal([100, 50]);
    expect(rent).to.equal(150 * epochRent);
  });

  it("makes no RPC calls when the position is not delegated", async () => {
    let calls = 0;
    const connection = {
      getMultipleAccountsInfo: async () => {
        calls++;
        return [];
      },
      getMinimumBalanceForRentExemption: async () => {
        calls++;
        return epochRent;
      },
    } as unknown as Connection;

    const rent = await getMissingEpochInfoRentLamports({
      connection,
      epochInfoKeys: [],
    });

    expect(rent).to.equal(0);
    expect(calls).to.equal(0);
  });
});
