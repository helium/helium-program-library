"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (!tables.includes("wallet_history")) {
      await queryInterface.createTable("wallet_history", {
        id: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true,
        },
        wallet: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        signature: {
          type: Sequelize.STRING,
          allowNull: false,
          unique: true,
        },
        action_type: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        action_metadata: {
          type: Sequelize.JSON,
          allowNull: true,
        },
        slot: {
          type: Sequelize.BIGINT,
          allowNull: false,
        },
        timestamp: {
          type: Sequelize.DATE,
          allowNull: false,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("NOW()"),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("NOW()"),
        },
      });

      await queryInterface.addIndex("wallet_history", ["wallet", "slot"], {
        name: "idx_wallet_history_wallet_slot",
      });

      await queryInterface.addIndex(
        "wallet_history",
        ["wallet", "action_type", "slot"],
        {
          name: "idx_wallet_history_wallet_action_type_slot",
        },
      );
    }

    if (!tables.includes("wallet_history_cursors")) {
      await queryInterface.createTable("wallet_history_cursors", {
        wallet: {
          type: Sequelize.STRING,
          primaryKey: true,
        },
        last_signature: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        last_slot: {
          type: Sequelize.BIGINT,
          allowNull: false,
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("NOW()"),
        },
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("wallet_history").catch(() => {});
    await queryInterface.dropTable("wallet_history_cursors").catch(() => {});
  },
};
