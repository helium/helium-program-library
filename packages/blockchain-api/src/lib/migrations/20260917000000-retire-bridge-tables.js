"use strict";

/**
 * The fiat on-ramp is retired, so its three tables are retired by rename. A
 * rename keeps the data and makes the step reversible. A later release drops
 * the renamed tables and the enum_bridge_users_account_type enum, which the
 * renamed bridge_users table still uses.
 *
 * Pods of the previous release still read these tables, so their fiat and
 * webhook routes fail from the rename until the rollout completes. The fiat
 * routes only served the removed frontend. The webhook route received the
 * provider's KYC callbacks, so disable that webhook before this release.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.renameTable(
        "bridge_transfers",
        "_retired_bridge_transfers",
        { transaction },
      );
      await queryInterface.renameTable(
        "bank_accounts",
        "_retired_bank_accounts",
        { transaction },
      );
      await queryInterface.renameTable("bridge_users", "_retired_bridge_users", {
        transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.renameTable("_retired_bridge_users", "bridge_users", {
        transaction,
      });
      await queryInterface.renameTable(
        "_retired_bank_accounts",
        "bank_accounts",
        { transaction },
      );
      await queryInterface.renameTable(
        "_retired_bridge_transfers",
        "bridge_transfers",
        { transaction },
      );
    });
  },
};
