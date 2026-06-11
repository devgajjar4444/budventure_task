'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert('users', [
      { id: 1, name: 'Alice', wallet_balance: 500.0 },
      { id: 2, name: 'Bob', wallet_balance: 200.0 },
      { id: 3, name: 'Charlie', wallet_balance: 50.0 },
      { id: 4, name: 'Diana', wallet_balance: 1000.0 },
      { id: 5, name: 'Eve', wallet_balance: 75.0 },
    ]);

    await queryInterface.bulkInsert('items', [
      { id: 101, name: 'Organic Milk', stock: 5, price: 4.99 },
      { id: 102, name: 'Whole Wheat Bread', stock: 100, price: 3.49 },
      { id: 103, name: 'Free-Range Eggs (12pk)', stock: 30, price: 6.99 },
    ]);

    await queryInterface.sequelize.query(
      "SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT MAX(id) FROM users))"
    );
    await queryInterface.sequelize.query(
      "SELECT setval(pg_get_serial_sequence('items', 'id'), (SELECT MAX(id) FROM items))"
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('reservations', null, {});
    await queryInterface.bulkDelete('items', null, {});
    await queryInterface.bulkDelete('users', null, {});
  },
};
