module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('questions', {
      id: { type: Sequelize.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      question_set_id: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      content: { type: Sequelize.TEXT, allowNull: false },
      choice_a: { type: Sequelize.TEXT, allowNull: false },
      choice_b: { type: Sequelize.TEXT, allowNull: false },
      choice_c: { type: Sequelize.TEXT, allowNull: false },
      choice_d: { type: Sequelize.TEXT, allowNull: false },
      correct_answer: { type: Sequelize.CHAR(1), allowNull: false },
      points: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 1000.00 },
      time_limit: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 30 },
      metadata: { type: Sequelize.JSON, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW }
    });

    await queryInterface.addConstraint('questions', {
      fields: ['question_set_id'],
      type: 'foreign key',
      name: 'fk_questions_qs',
      references: { table: 'question_sets', field: 'id' },
      onDelete: 'CASCADE'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('questions');
  }
};
