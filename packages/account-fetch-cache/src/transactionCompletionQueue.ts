import {
  Commitment,
  Connection,
  SignatureStatus,
  TransactionConfirmationStatus,
} from "@solana/web3.js";
import { chunks } from "./getMultipleAccounts";
import { sleep } from "./utils";

const TIMEOUT = 2 * 60 * 1000; // 2 minutes

// Ensure we don't go over the limit of 100 per check
async function getSignatureStatusesBatch(
  connection: Connection,
  txids: string[]
): Promise<Array<SignatureStatus | null>> {
  return (
    await Promise.all(
      chunks(txids, 200).map((chunk) => connection.getSignatureStatuses(chunk))
    )
  )
    .map((v) => v.value)
    .flat();
}

/**
 * Confirmation levels that count as landed for the commitment that was asked for.
 * A node only reports the three modern levels, so each deprecated alias takes the row of the level it names.
 */
const LANDED_LEVELS: Record<
  Commitment,
  readonly TransactionConfirmationStatus[]
> = {
  processed: ["processed", "confirmed", "finalized"],
  recent: ["processed", "confirmed", "finalized"],
  confirmed: ["confirmed", "finalized"],
  single: ["confirmed", "finalized"],
  singleGossip: ["confirmed", "finalized"],
  finalized: ["finalized"],
  root: ["finalized"],
  max: ["finalized"],
};

const hasLanded = (status: SignatureStatus, commitment: Commitment) =>
  !status.confirmationStatus ||
  LANDED_LEVELS[commitment].includes(status.confirmationStatus);

export class TransactionCompletionQueue {
  log: boolean;
  connection: Connection;
  txPromises: Record<
    Commitment,
    Record<string, Promise<SignatureStatus | null | void>>
  > = {} as any;
  lastQuery: Date = new Date();
  currentStatuses: Record<Commitment, Record<string, SignatureStatus | null>> =
    {} as any;

  constructor({ connection, log }: { connection: Connection; log: boolean }) {
    this.connection = connection;
    this.log = log;
  }

  async queryStatuses(
    commitment: Commitment
  ): Promise<Record<string, SignatureStatus | null>> {
    // Requery every 2 seconds
    if (
      !this.currentStatuses[commitment] ||
      this.lastQuery.valueOf() + 2000 < new Date().valueOf()
    ) {
      const txids = Object.keys(this.txPromises[commitment] || {});
      if (txids.length > 0) {
        const statuses = await getSignatureStatusesBatch(
          this.connection,
          txids
        );
        this.currentStatuses[commitment] = statuses.reduce(
          (acc, status, index) => {
            const txid = txids[index];
            acc[txid] = status;
            return acc;
          },
          {} as Record<string, SignatureStatus | null>
        );
      } else {
        this.currentStatuses[commitment] = {};
      }
      this.lastQuery = new Date();
    }

    return this.currentStatuses[commitment];
  }

  async wait(
    commitment: Commitment,
    txid: string,
    timeout: number = TIMEOUT
  ): Promise<SignatureStatus | null | void> {
    const connection = this.connection;
    if (!this.txPromises[commitment]) {
      this.txPromises[commitment] = {};
    }
    const existing = this.txPromises[commitment][txid];
    if (existing) {
      return existing;
    }

    let done = false;
    let status: SignatureStatus | null | void = {
      slot: 0,
      confirmations: 0,
      err: null,
    };
    // Subscription ids start at 0, so no default: a failed subscribe must not
    // remove another caller's subscription on the shared connection.
    let subId: number | undefined;
    const cleanup = async () => {
      done = true;
      // @ts-ignore
      this.txPromises[commitment][txid] = undefined;
      if (subId !== undefined) {
        try {
          await connection.removeSignatureListener(subId);
        } catch (e) {
          // Already removed.
        }
      }
    };
    this.txPromises[commitment][txid] = new Promise(async (resolve, reject) => {
      let t: NodeJS.Timeout;
      function setDone() {
        cleanup();
        clearTimeout(t);
      }
      t = setTimeout(() => {
        if (done) {
          return;
        }
        setDone();
        this.log && console.log("Rejecting for timeout...");
        reject({ timeout: true });
      }, timeout);
      try {
        subId = connection.onSignature(
          txid,
          (result: any, context: any) => {
            status = {
              err: result.err,
              slot: context.slot,
              confirmations: 0,
            };
            // web3.js removes a signature listener itself once it fires.
            subId = undefined;
            setDone();
            if (result.err) {
              this.log && console.log("Rejected via websocket", result.err);
              reject(status);
            } else if (hasLanded(status, commitment)) {
              resolve(status);
            }
          },
          commitment
        );
      } catch (e) {
        this.log && console.error("WS error in setup", txid, e);
      }
      while (!done) {
        // eslint-disable-next-line no-loop-func
        (async () => {
          try {
            status = (await this.queryStatuses(commitment))[txid];
            if (!done) {
              if (!status) {
              } else if (status.err) {
                this.log && console.log("REST error for", txid, status);
                setDone();
                reject(status.err);
              } else if (!status.confirmations && !status.confirmationStatus) {
                this.log &&
                  console.log("REST no confirmations for", txid, status);
              } else {
                this.log && console.log("REST confirmation for", txid, status);
                if (hasLanded(status, commitment)) {
                  setDone();
                  resolve(status);
                }
              }
            }
          } catch (e) {
            if (!done) {
              this.log && console.log("REST connection error: txid", txid, e);
            }
          }
        })();
        await sleep(2000);
      }
    });
    return this.txPromises[commitment][txid];
  }
}
