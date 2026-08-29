"use strict";

/**
 * Client-supplied tags can exceed varchar(255) (the wallet-app multi-recipient
 * payment tag reaches ~712 chars), which crashed the tag reservation in
 * transactions.submit with a raw 500. varchar -> text is binary coercible so
 * Postgres skips the table rewrite, but it still rebuilds the partial unique
 * index on (tag, payer) where status='pending' under an ACCESS EXCLUSIVE
 * lock; that index only holds in-flight batches, so the rebuild is short.
 *
 * down() narrows the column back and fails if any row holds a tag longer
 * than 255 chars, which is the correct outcome: rolling back must not
 * truncate data.
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
