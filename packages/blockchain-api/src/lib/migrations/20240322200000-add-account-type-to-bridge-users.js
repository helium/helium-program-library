"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("bridge_users", "account_type", {
      type: Sequelize.ENUM("individual", "business"),
      allowNull: true,
      after: "kyc_link",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("bridge_users", "account_type");
    await queryInterface.sequelize.query(
      "DROP TYPE IF EXISTS enum_bridge_users_account_type",
    );
  },
};
