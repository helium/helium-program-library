module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable(
      "pending_transactions",
    );
    if (tableInfo.tag) {
      await queryInterface.removeColumn("pending_transactions", "tag");
    }
  },

  async down(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable(
      "pending_transactions",
    );
    if (!tableInfo.tag) {
      await queryInterface.addColumn("pending_transactions", "tag", {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }
  },
};
