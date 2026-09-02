import { Connection, Keypair } from "@solana/web3.js";
import { expect } from "chai";
import { describe, it } from "mocha";
import { RENT_COSTS } from "../../src/lib/utils/balance-validation";
import { getAutomationRentLamports } from "../../src/server/api/routers/governance/procedures/helpers/rent";

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
