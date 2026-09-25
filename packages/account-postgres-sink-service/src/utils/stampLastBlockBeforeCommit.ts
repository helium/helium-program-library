import * as anchor from "@coral-xyz/anchor";
import { ModelStatic, Op, Transaction } from "sequelize";
import { chunks } from "./chunks";
import { getFinalizedSlot } from "./getFinalizedSlot";

const UPDATE_CHUNK_SIZE = 5000;

// A slot read at the start of the batch can fall behind the publisher's job
// cursor while the transaction is open, and rows at or below that cursor are
// never published. Restamp the changed rows with a slot read just before
// commit, in the batch transaction. The stamp commits atomically with the
// rows, so a failed slot read or update rolls the batch back instead of
// leaving rows below the publisher cursor.
export const stampLastBlockBeforeCommit = async ({
  connection,
  model,
  addresses,
  transaction,
}: {
  connection: anchor.web3.Connection;
  model: ModelStatic<any>;
  addresses: string[];
  transaction: Transaction;
}) => {
  if (addresses.length === 0) return;

  const lastBlock = await getFinalizedSlot(connection);
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
};
