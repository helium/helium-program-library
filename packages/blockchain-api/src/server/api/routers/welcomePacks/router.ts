import { list } from "./procedures/list";
import { create } from "./procedures/create";
import { get } from "./procedures/get";
import { deletePack } from "./procedures/deletePack";
import { getByAddress } from "./procedures/getByAddress";
import { claim } from "./procedures/claim";
import { invite } from "./procedures/invite";
import { welcomePacksContract } from "@helium/blockchain-api/contracts";
import { implement } from "@orpc/server";

/**
 * Welcome Packs router - handles welcome pack operations.
 */
export const welcomePacksRouter = implement(welcomePacksContract).router({
  /** List all welcome packs for a wallet */
  list,
  /** Create a new welcome pack */
  create,
  /** Get a welcome pack by wallet and pack ID */
  get,
  /** Delete a welcome pack */
  delete: deletePack,
  /** Get a welcome pack by its address */
  getByAddress,
  /** Claim a welcome pack */
  claim,
  /** Generate an invite message for a welcome pack */
  invite,
});
