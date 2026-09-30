import { expect } from "chai";
import { awaitTransactionSignatureConfirmation } from "../src/transaction";

// A node whose signature subscription only fires when told to, with ids that
// don't start at 0 so a defaulted id can't pass for the real one. Like
// web3.js, it removes a signature listener itself once it fires.
const fakeWsNode = () => {
  const removed: number[] = [];
  let notify: (() => void) | undefined;
  const connection: any = {
    onSignature: (_txid: string, callback: any) => {
      notify = () => {
        callback({ err: null }, { slot: 1 });
        connection.removeSignatureListener(7);
      };
      return 7;
    },
    removeSignatureListener: async (id: number) => {
      removed.push(id);
    },
    getSignatureStatuses: async () => ({ value: [null] }),
  };
  return { connection, removed, notify: () => notify! };
};

describe("awaitTransactionSignatureConfirmation", () => {
  it("removes the signature subscription when the transaction times out", async () => {
    const { connection, removed } = fakeWsNode();

    const err = await awaitTransactionSignatureConfirmation(
      "sig",
      50,
      connection,
      "confirmed",
    ).catch((e) => e);

    expect(err).to.deep.equal({ timeout: true });
    expect(removed).to.deep.equal([7]);
  });

  it("resolves and removes the subscription once when the transaction confirms via websocket", async () => {
    const { connection, removed, notify } = fakeWsNode();

    const confirmation = awaitTransactionSignatureConfirmation(
      "sig",
      60 * 1000,
      connection,
      "confirmed",
    );
    await new Promise((resolve) => setImmediate(resolve));
    notify()();

    expect(await confirmation).to.deep.equal({
      err: null,
      slot: 1,
      confirmations: 0,
    });
    expect(removed).to.deep.equal([7]);
  });
});
