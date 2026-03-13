"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("bridge_transfers", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      bridge_transfer_id: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      bridge_user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "bridge_users",
          key: "id",
        },
      },
      bank_account_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "bank_accounts",
          key: "id",
        },
      },
      amount: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      state: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      solana_signature: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.addIndex("bridge_transfers", ["bridge_transfer_id"]);
    await queryInterface.addIndex("bridge_transfers", ["bridge_user_id"]);
    await queryInterface.addIndex("bridge_transfers", ["bank_account_id"]);
    await queryInterface.addIndex("bridge_transfers", ["state"]);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable("bridge_transfers");
  },
};
