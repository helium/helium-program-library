"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("bank_accounts", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      bridge_user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "bridge_users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      bridge_external_account_id: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      bridge_liquidation_address_id: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      liquidation_address: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      account_name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      bank_name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      last_four_digits: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      routing_number: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      account_type: {
        type: Sequelize.STRING,
        allowNull: false,
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
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("bank_accounts");
  },
};
