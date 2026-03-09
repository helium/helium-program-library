"use strict";

const { DataTypes } = require("sequelize");

module.exports = {
  async up(queryInterface, Sequelize) {
    // Create transaction_batches table
    await queryInterface.createTable("transaction_batches", {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      parallel: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "pending",
      },
      submission_type: {
        type: DataTypes.ENUM("single", "parallel", "sequential", "jito_bundle"),
        allowNull: false,
      },
      jito_bundle_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      cluster: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      tag: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      payer: {
        type: DataTypes.STRING,
        allowNull: false,
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

    // Create a partial unique index for tag + payer when status is 'pending'
    await queryInterface.addIndex("transaction_batches", {
      fields: ["tag", "payer"],
      unique: true,
      where: {
        status: "pending",
        tag: {
          [Sequelize.Op.ne]: null,
        },
      },
      name: "transaction_batches_tag_payer_pending_unique",
    });

    // Add batch_id column to pending_transactions table
    await queryInterface.addColumn("pending_transactions", "batch_id", {
      type: DataTypes.STRING,
      allowNull: true,
      references: {
        model: "transaction_batches",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("pending_transactions", "batch_id");
    await queryInterface.removeIndex(
      "transaction_batches",
      "transaction_batches_tag_payer_pending_unique",
    );
    await queryInterface.dropTable("transaction_batches");
  },
};
