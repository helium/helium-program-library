"use strict";

const { DataTypes } = require("sequelize");

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("pending_transactions", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      signature: {
        type: DataTypes.STRING,
      },
      serialized_transaction: {
        type: DataTypes.TEXT,
      },
      blockhash: {
        type: DataTypes.STRING,
      },
      status: {
        type: DataTypes.STRING,
      },
      type: {
        type: DataTypes.STRING,
      },
      metadata: {
        type: DataTypes.JSON,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("pending_transactions");
  },
};
