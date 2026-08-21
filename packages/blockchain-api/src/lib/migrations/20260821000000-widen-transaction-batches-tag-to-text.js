"use strict";

/**
 * Client-supplied tags can exceed varchar(255) (the wallet-app multi-recipient
 * payment tag reaches ~712 chars), which crashed the tag reservation in
 * transactions.submit with a raw 500. Postgres keeps indexes across a
 * varchar -> text type change, so the partial unique index on (tag, payer)
 * where status='pending' survives untouched.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("transaction_batches", "tag", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn("transaction_batches", "tag", {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },
};
