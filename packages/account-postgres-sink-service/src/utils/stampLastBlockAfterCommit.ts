import * as anchor from "@coral-xyz/anchor";
import retry from "async-retry";
import { ModelStatic, Op } from "sequelize";
import { chunks } from "./chunks";

const UPDATE_CHUNK_SIZE = 5000;
const PG_DEADLOCK_DETECTED = "40P01";

// A slot read before commit can fall behind the publisher's job cursor while
// the transaction is open, and rows at or below that cursor are never
// published. Restamp the committed rows with a slot read after commit. This
// narrows the gap to the time between this read and the update's commit.
// The chunks commit in one transaction so the publisher never sees part of the
// batch at the new slot.
export const stampLastBlockAfterCommit = async ({
  connection,
  model,
  addresses,
}: {
  connection: anchor.web3.Connection;
  model: ModelStatic<any>;
  addresses: string[];
}) => {
  if (addresses.length === 0) return;

  try {
    // The slot is re-read on each attempt because the publisher cursor keeps
    // moving during the backoff.
    await retry(
      async (bail) => {
        try {
          const lastBlock = await retry(() => connection.getSlot("finalized"), {
            retries: 3,
            factor: 2,
            minTimeout: 1000,
            maxTimeout: 5000,
          });
          await model.sequelize!.transaction(async (transaction) => {
            for (const chunk of chunks(addresses, UPDATE_CHUNK_SIZE)) {
              await model.update(
                { lastBlock },
                // The guard keeps a newer substream write from being lowered.
                {
                  where: { address: chunk, lastBlock: { [Op.lt]: lastBlock } },
                  transaction,
                },
              );
            }
          });
        } catch (err) {
          if ((err as any)?.parent?.code === PG_DEADLOCK_DETECTED) throw err;
          return bail(err as Error);
        }
      },
      { retries: 3, factor: 2, minTimeout: 100, maxTimeout: 1000 },
    );
  } catch (error) {
    // The rows are committed; they keep their pre-commit stamp.
    console.warn("Failed to restamp last block after commit:", error);
  }
};
