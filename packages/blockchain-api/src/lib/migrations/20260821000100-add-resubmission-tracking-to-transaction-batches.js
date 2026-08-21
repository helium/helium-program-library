"use strict";

/**
 * Per-batch resubmission bookkeeping. The resubmission job polls every 2s on
 * every replica and used to resubmit each pending batch on every tick; these
 * columns give it a backoff window and a retry cap.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable("transaction_batches");

    if (!tableInfo.resubmission_count) {
      await queryInterface.addColumn(
        "transaction_batches",
        "resubmission_count",
        {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        }
      );
    }

    if (!tableInfo.last_resubmitted_at) {
      await queryInterface.addColumn(
        "transaction_batches",
        "last_resubmitted_at",
        {
          type: Sequelize.DATE,
          allowNull: true,
        }
      );
    }
  },

  async down(queryInterface) {
    await queryInterface
      .removeColumn("transaction_batches", "resubmission_count")
      .catch(() => {});
    await queryInterface
      .removeColumn("transaction_batches", "last_resubmitted_at")
      .catch(() => {});
  },
};
