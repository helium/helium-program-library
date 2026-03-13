"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn("bridge_users", "tos_link", {
      type: Sequelize.TEXT,
      field: "tos_link",
    });

    await queryInterface.changeColumn("bridge_users", "kyc_link", {
      type: Sequelize.TEXT,
      field: "kyc_link",
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn("bridge_users", "tos_link", {
      type: Sequelize.STRING(255),
      field: "tos_link",
    });

    await queryInterface.changeColumn("bridge_users", "kyc_link", {
      type: Sequelize.STRING(255),
      field: "kyc_link",
    });
  },
};
