import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { FastifyInstance } from "fastify";
import { validateMigrateWallets } from "./validate";

export const ATTESTATION =
  "I attest that both the source and destination wallets are owned and controlled by the same individual or entity, and that I have legal authority to perform this transaction on behalf of that individual or entity.";

// Registered separately from index.ts so the route can be exercised with
// fastify.inject() in a unit test; index.ts starts listening at import time.
export const registerLedgerMigrate = (
  server: FastifyInstance,
  deps: {
    feePayer: PublicKey;
    getMigrateTransactions: (
      from: PublicKey,
      to: PublicKey,
    ) => Promise<VersionedTransaction[]>;
  },
) => {
  server.post<{
    Body: { from: string; to: string; attestation: string };
  }>("/ledger/migrate", async (request, reply) => {
    const from = new PublicKey(request.body.from);
    const to = new PublicKey(request.body.to);
    if (request.body.attestation !== ATTESTATION) {
      return reply.code(400).send({ error: "Invalid attestation" });
    }
    const invalid = validateMigrateWallets(from, to, deps.feePayer);
    if (invalid) {
      return reply.code(400).send({ error: invalid });
    }

    return (await deps.getMigrateTransactions(from, to)).map(
      (tx) => Buffer.from(tx.serialize()).toJSON().data,
    );
  });
};
