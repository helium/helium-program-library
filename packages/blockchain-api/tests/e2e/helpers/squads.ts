import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import assert from "assert";

/**
 * Create a fresh Squads v4 multisig on the fork and wait for it to be indexed,
 * returning its PDA. Threshold and members are caller-specified so each test can
 * shape its own approve/reject/cancel cutoffs.
 */
export async function createTestMultisig(params: {
  connection: Connection;
  creator: Keypair;
  threshold: number;
  members: multisig.types.Member[];
}): Promise<PublicKey> {
  const { connection, creator, threshold, members } = params;

  const createKey = Keypair.generate();
  const [multisigPda] = multisig.getMultisigPda({
    createKey: createKey.publicKey,
  });
  const [programConfigPda] = multisig.getProgramConfigPda({});
  const programConfig =
    await multisig.accounts.ProgramConfig.fromAccountAddress(
      connection,
      programConfigPda
    );

  await multisig.rpc.multisigCreateV2({
    connection,
    treasury: programConfig.treasury,
    createKey,
    creator,
    multisigPda,
    configAuthority: null,
    threshold,
    members,
    timeLock: 0,
    rentCollector: null,
    sendOptions: { skipPreflight: false },
  });

  let created = false;
  for (let i = 0; i < 30 && !created; i++) {
    created = (await connection.getAccountInfo(multisigPda)) !== null;
    if (!created) await new Promise((r) => setTimeout(r, 1000));
  }
  assert.ok(created, "multisig account was not created on the fork");

  return multisigPda;
}
