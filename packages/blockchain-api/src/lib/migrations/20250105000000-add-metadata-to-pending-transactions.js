"use strict";

const { DataTypes } = require("sequelize");

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable(
      "pending_transactions",
    );

    // Add metadata column if it doesn't exist
    if (!tableInfo.metadata) {
      await queryInterface.addColumn("pending_transactions", "metadata", {
        type: DataTypes.JSON,
        allowNull: true,
        comment:
          "JSON metadata for the transaction including type, description, and other details",
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable(
      "pending_transactions",
    );

    // Remove metadata column if it exists
    if (tableInfo.metadata) {
      await queryInterface.removeColumn("pending_transactions", "metadata");
    }
  },
};
