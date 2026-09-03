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
 * @type {import('sequelize-cli').Migration}
 */
const INDEXES = [
  { name: "idx_pending_transactions_signature", column: "signature" },
  { name: "idx_pending_transactions_batch_id", column: "batch_id" },
];

module.exports = {
  async up(queryInterface) {
    for (const { name, column } of INDEXES) {
      // to_regclass resolves through the search path, the same way the
      // unqualified CREATE INDEX below does, so a same-named index in another
      // schema is not mistaken for this one. It yields NULL when none exists.
      const [rows] = await queryInterface.sequelize.query(
        `SELECT indisvalid FROM pg_index WHERE indexrelid = to_regclass(:name)`,
        { replacements: { name } },
      );
      if (rows.length > 0 && rows[0].indisvalid) {
        continue;
      }
      if (rows.length > 0) {
        await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "${name}"`);
      }
      await queryInterface.addIndex("pending_transactions", [column], {
        name,
        concurrently: true,
      });
    }
  },

  async down(queryInterface) {
    for (const { name } of INDEXES) {
      await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "${name}"`);
    }
  },
};
