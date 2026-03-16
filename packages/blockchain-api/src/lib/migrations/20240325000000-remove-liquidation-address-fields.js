"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn(
      "bank_accounts",
      "bridge_liquidation_address_id",
    );
    await queryInterface.removeColumn("bank_accounts", "liquidation_address");
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn(
      "bank_accounts",
      "bridge_liquidation_address_id",
      {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
    );
    await queryInterface.addColumn("bank_accounts", "liquidation_address", {
      type: Sequelize.STRING,
      allowNull: false,
    });
  },
};
