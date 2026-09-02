"use strict";

/**
 * transactions.history looks up pending_transactions by signature for every
 * on-chain transaction it syncs and joins them to batches by batch_id. Neither
 * column was indexed, so each lookup was a sequential scan; a single history
 * request for a busy wallet pinned the monitoring-rds CPU for minutes.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface
      .addIndex("pending_transactions", ["signature"], {
        name: "idx_pending_transactions_signature",
      })
      .catch(() => {});

    await queryInterface
      .addIndex("pending_transactions", ["batch_id"], {
        name: "idx_pending_transactions_batch_id",
      })
      .catch(() => {});
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      "pending_transactions",
      "idx_pending_transactions_signature",
    );
    await queryInterface.removeIndex(
      "pending_transactions",
      "idx_pending_transactions_batch_id",
    );
  },
};
