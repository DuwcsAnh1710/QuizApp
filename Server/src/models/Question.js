// models/Question.js
import { DataTypes } from 'sequelize';
import sequelize from '../config/sequelize.js';
import QuestionSet from './QuestionSet.js';


const Question = sequelize.define('Question', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    question_set_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    choice_a: { type: DataTypes.TEXT, allowNull: false },
    choice_b: { type: DataTypes.TEXT, allowNull: false },
    choice_c: { type: DataTypes.TEXT, allowNull: false },
    choice_d: { type: DataTypes.TEXT, allowNull: false },
    correct_answer: { type: DataTypes.CHAR(1), allowNull: false },
    points: { type: DataTypes.DECIMAL(10, 2), defaultValue: 1000.00 },
    time_limit: { type: DataTypes.INTEGER, defaultValue: 30 },
    metadata: { type: DataTypes.JSON, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
    tableName: 'questions',
    timestamps: false
});


Question.belongsTo(QuestionSet, { foreignKey: 'question_set_id', as: 'set' });
QuestionSet.hasMany(Question, { foreignKey: 'question_set_id', as: 'questions' });


export default Question;