module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('room_players', {
      id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      room_id: { type: Sequelize.STRING(64), allowNull: false },
      user_id: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
      display_name: { type: Sequelize.STRING(100), allowNull: false },
      socket_id: { type: Sequelize.STRING(255), allowNull: true },
      score: { type: Sequelize.DECIMAL(8, 2), allowNull: false, defaultValue: 0 },
      joined_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW }
    });

    await queryInterface.addConstraint('room_players', {
      fields: ['room_id'],
      type: 'foreign key',
      name: 'fk_room_players_room',
      references: { table: 'rooms', field: 'id' },
      onDelete: 'CASCADE'
    });

    await queryInterface.addConstraint('room_players', {
      fields: ['user_id'],
      type: 'foreign key',
      name: 'fk_room_players_user',
      references: { table: 'users', field: 'id' },
      onDelete: 'SET NULL'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('room_players');
  }
};
