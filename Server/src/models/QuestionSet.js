// models/QuestionSet.js
import { DataTypes } from 'sequelize';
import sequelize from '../config/sequelize.js';
import User from './User.js';


const QuestionSet = sequelize.define('QuestionSet', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    user_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    is_public: { type: DataTypes.TINYINT, defaultValue: 1 },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
    tableName: 'question_sets',
    timestamps: false
});


QuestionSet.belongsTo(User, { foreignKey: 'user_id', as: 'owner' });
User.hasMany(QuestionSet, { foreignKey: 'user_id', as: 'question_sets' });


export default QuestionSet;