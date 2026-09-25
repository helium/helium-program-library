import * as anchor from "@coral-xyz/anchor";
import retry from "async-retry";

export const getFinalizedSlot = (connection: anchor.web3.Connection) =>
  retry(() => connection.getSlot("finalized"), {
    retries: 3,
    factor: 2,
    minTimeout: 1000,
    maxTimeout: 5000,
  });
