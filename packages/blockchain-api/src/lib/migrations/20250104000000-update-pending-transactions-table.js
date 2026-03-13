"use strict";

const { DataTypes } = require("sequelize");

module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if columns exist before trying to remove them
    const tableInfo = await queryInterface.describeTable(
      "pending_transactions",
    );

    // Remove unused columns: serializedTransaction and metadata
    if (tableInfo.serialized_transaction) {
      await queryInterface.removeColumn(
        "pending_transactions",
        "serialized_transaction",
      );
    }
    if (tableInfo.metadata) {
      await queryInterface.removeColumn("pending_transactions", "metadata");
    }

    // Add new columns: tag and payer
    if (!tableInfo.tag) {
      await queryInterface.addColumn("pending_transactions", "tag", {
        type: DataTypes.STRING,
        allowNull: true,
      });
    }

    if (!tableInfo.payer) {
      // Delete existing records since they don't have payer information
      await queryInterface.sequelize.query(`
        DELETE FROM pending_transactions
      `);

      // Add payer as non-nullable since table is now empty
      await queryInterface.addColumn("pending_transactions", "payer", {
        type: DataTypes.STRING,
        allowNull: false,
      });
    }

    // Create a partial unique index for tag + payer when status is 'pending'
    // This ensures tags are unique per payer only when the transaction is pending
    try {
      await queryInterface.addIndex("pending_transactions", {
        fields: ["tag", "payer"],
        unique: true,
        where: {
          status: "pending",
          tag: {
            [Sequelize.Op.ne]: null,
          },
        },
        name: "pending_transactions_tag_payer_pending_unique",
      });
    } catch (error) {
      // Index might already exist, ignore error
      console.log(
        "Index already exists or could not be created:",
        error.message,
      );
    }
  },

  async down(queryInterface, Sequelize) {
    // Remove the unique index if it exists
    try {
      await queryInterface.removeIndex(
        "pending_transactions",
        "pending_transactions_tag_payer_pending_unique",
      );
    } catch (error) {
      // Index might not exist, ignore error
      console.log("Index already removed or does not exist");
    }

    // Remove the new columns
    const tableInfo = await queryInterface.describeTable(
      "pending_transactions",
    );
    if (tableInfo.payer) {
      await queryInterface.removeColumn("pending_transactions", "payer");
    }
    if (tableInfo.tag) {
      await queryInterface.removeColumn("pending_transactions", "tag");
    }

    // Re-add the removed columns
    if (!tableInfo.serialized_transaction) {
      await queryInterface.addColumn(
        "pending_transactions",
        "serialized_transaction",
        {
          type: DataTypes.TEXT,
        },
      );
    }

    if (!tableInfo.metadata) {
      await queryInterface.addColumn("pending_transactions", "metadata", {
        type: DataTypes.JSON,
      });
    }
  },
};
