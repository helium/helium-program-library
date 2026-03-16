"use strict";

const { DataTypes } = require("sequelize");

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add serializedTransaction column to pending_transactions table
    await queryInterface.addColumn(
      "pending_transactions",
      "serialized_transaction",
      {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Base64 encoded serialized transaction for resubmission",
      },
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn(
      "pending_transactions",
      "serialized_transaction",
    );
  },
};
