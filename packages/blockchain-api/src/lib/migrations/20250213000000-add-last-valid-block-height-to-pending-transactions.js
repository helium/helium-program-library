"use strict";

const { DataTypes } = require("sequelize");

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      "pending_transactions",
      "last_valid_block_height",
      {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn(
      "pending_transactions",
      "last_valid_block_height",
    );
  },
};
