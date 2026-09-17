"use strict";

/**
 * The fiat on-ramp is retired, so its three tables go. The order follows the
 * foreign keys: bridge_transfers references bank_accounts and bridge_users,
 * and bank_accounts references bridge_users.
 *
 * down() throws: the rows are gone, and recreating empty tables would only
 * pretend to restore them.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.dropTable("bridge_transfers");
    await queryInterface.dropTable("bank_accounts");
    await queryInterface.dropTable("bridge_users");
  },

  async down() {
    throw new Error(
      "drop-bridge-tables cannot be reverted: the dropped tables and their data are not restored",
    );
  },
};
