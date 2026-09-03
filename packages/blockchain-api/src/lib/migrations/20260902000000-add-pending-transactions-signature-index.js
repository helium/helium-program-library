"use strict";

/**
 * transactions.history looks up pending_transactions by signature for every
 * on-chain transaction it syncs and joins them to batches by batch_id. Neither
 * column was indexed, so each lookup was a sequential scan; a single history
 * request for a busy wallet pinned the monitoring-rds CPU for minutes.
 *
 * The indexes are built CONCURRENTLY so the submit path keeps writing while
 * they build. A concurrent build that fails leaves an INVALID index behind
 * (postgres keeps the catalog entry and the planner ignores it), so each index
 * is checked first: a valid one is kept, an invalid leftover is dropped and
 * rebuilt. sequelize-cli does not wrap migrations in a transaction, which
 * CREATE INDEX CONCURRENTLY could not run inside anyway.
 *
 * Every replica runs db:migrate on start, so two can reach this at once. An
 * index mid-build also shows as invalid, and the second replica would drop the
 * first one's live build and fail its start. A session advisory lock serialises
 * them: the second waits, then finds the valid index and keeps it. Session
 * locks belong to one connection, so the whole migration runs on a single
 * client taken from the pool rather than through sequelize's pooled query.
 *
 * @type {import('sequelize-cli').Migration}
 */
const INDEXES = [
  { name: "idx_pending_transactions_signature", column: "signature" },
  { name: "idx_pending_transactions_batch_id", column: "batch_id" },
];

/** Arbitrary but fixed; only this migration takes it. */
const ADVISORY_LOCK_KEY = 20260902;

module.exports = {
  async up(queryInterface) {
    const manager = queryInterface.sequelize.connectionManager;
    const client = await manager.getConnection({ type: "write" });
    try {
      await client.query("SELECT pg_advisory_lock($1)", [ADVISORY_LOCK_KEY]);
      try {
        for (const { name, column } of INDEXES) {
          // to_regclass resolves through the search path, the same way the
          // unqualified CREATE INDEX below does, so a same-named index in
          // another schema is not mistaken for this one. It yields NULL when
          // none exists.
          const { rows } = await client.query(
            "SELECT indisvalid FROM pg_index WHERE indexrelid = to_regclass($1)",
            [name],
          );
          if (rows.length > 0 && rows[0].indisvalid) {
            continue;
          }
          if (rows.length > 0) {
            // CONCURRENTLY so the drop waits for readers instead of taking
            // ACCESS EXCLUSIVE on the table and queueing the submit path
            // behind a long read.
            await client.query(`DROP INDEX CONCURRENTLY IF EXISTS "${name}"`);
          }
          await client.query(
            `CREATE INDEX CONCURRENTLY "${name}" ON "pending_transactions" ("${column}")`,
          );
        }
      } finally {
        await client.query("SELECT pg_advisory_unlock($1)", [
          ADVISORY_LOCK_KEY,
        ]);
      }
    } finally {
      manager.releaseConnection(client);
    }
  },

  async down(queryInterface) {
    for (const { name } of INDEXES) {
      await queryInterface.sequelize.query(
        `DROP INDEX CONCURRENTLY IF EXISTS "${name}"`,
      );
    }
  },
};
