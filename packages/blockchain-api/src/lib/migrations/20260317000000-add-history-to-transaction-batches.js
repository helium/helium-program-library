"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable("transaction_batches");

    if (!tableInfo.action_type) {
      await queryInterface.addColumn("transaction_batches", "action_type", {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!tableInfo.action_metadata) {
      await queryInterface.addColumn("transaction_batches", "action_metadata", {
        type: Sequelize.JSON,
        allowNull: true,
      });
    }

    if (!tableInfo.confirmed_at) {
      await queryInterface.addColumn("transaction_batches", "confirmed_at", {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }

    await queryInterface.addIndex(
      "transaction_batches",
      ["payer", "confirmed_at"],
      {
        name: "idx_tx_batches_payer_confirmed_at",
        order: [["confirmed_at", "DESC NULLS LAST"]],
        where: { confirmed_at: { [Sequelize.Op.ne]: null } },
      },
    ).catch(() => {});

    await queryInterface.addIndex(
      "transaction_batches",
      ["payer", "status"],
      {
        name: "idx_tx_batches_payer_status",
      },
    ).catch(() => {});

    await queryInterface.addIndex(
      "transaction_batches",
      ["payer", "action_type", "confirmed_at"],
      {
        name: "idx_tx_batches_payer_action_type_confirmed_at",
      },
    ).catch(() => {});
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      "transaction_batches",
      "idx_tx_batches_payer_confirmed_at",
    ).catch(() => {});
    await queryInterface.removeIndex(
      "transaction_batches",
      "idx_tx_batches_payer_status",
    ).catch(() => {});
    await queryInterface.removeIndex(
      "transaction_batches",
      "idx_tx_batches_payer_action_type_confirmed_at",
    ).catch(() => {});

    await queryInterface.removeColumn("transaction_batches", "action_type").catch(() => {});
    await queryInterface.removeColumn("transaction_batches", "action_metadata").catch(() => {});
    await queryInterface.removeColumn("transaction_batches", "confirmed_at").catch(() => {});
  },
};
