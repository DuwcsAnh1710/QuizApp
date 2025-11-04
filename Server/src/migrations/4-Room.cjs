module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('rooms', {
      id: { type: Sequelize.STRING(64), primaryKey: true },
      hostUserId: { type: Sequelize.STRING(64), allowNull: true },
      question_set_id: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      started_at: { type: Sequelize.DATE, allowNull: true },
      ended_at: { type: Sequelize.DATE, allowNull: true },
      status: {
        type: Sequelize.ENUM('waiting', 'playing', 'finished'),
        allowNull: false,
        defaultValue: 'waiting'
      }
    });

    await queryInterface.addConstraint('rooms', {
      fields: ['host_user_id'],
      type: 'foreign key',
      name: 'fk_rooms_host',
      references: { table: 'users', field: 'id' },
      onDelete: 'SET NULL'
    });

    await queryInterface.addConstraint('rooms', {
      fields: ['question_set_id'],
      type: 'foreign key',
      name: 'fk_rooms_qs',
      references: { table: 'question_sets', field: 'id' },
      onDelete: 'SET NULL'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('rooms');
  }
};
