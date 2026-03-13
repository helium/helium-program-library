"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("bridge_users", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      privy_user_id: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      bridge_customer_id: {
        type: Sequelize.STRING,
        unique: true,
      },
      kyc_link_id: {
        type: Sequelize.STRING,
        unique: true,
      },
      kyc_status: {
        type: Sequelize.STRING,
        defaultValue: "not_started",
      },
      tos_status: {
        type: Sequelize.STRING,
        defaultValue: "pending",
      },
      tos_link: {
        type: Sequelize.STRING,
        field: "tos_link",
      },
      kyc_link: {
        type: Sequelize.STRING,
        field: "kyc_link",
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("now"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("now"),
      },
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable("bridge_users");
  },
};
