"use strict";

/**
 * Clear cached wallet history so transactions are re-fetched and
 * re-classified with the new delegation_rewards_distribution type.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    const tables = await queryInterface.showAllTables();

    if (tables.includes("wallet_history")) {
      await queryInterface.bulkDelete("wallet_history", null, {});
    }
    if (tables.includes("wallet_history_cursors")) {
      await queryInterface.bulkDelete("wallet_history_cursors", null, {});
    }
  },

  async down() {
    // Cache data is ephemeral and will be re-populated on next sync.
    // Nothing to restore.
  },
};
