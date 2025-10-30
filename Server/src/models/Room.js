// models/Room.js
import { DataTypes } from 'sequelize';
import sequelize from '../config/sequelize.js';
import User from './User.js';
import QuestionSet from './QuestionSet.js';
import RoomPlayer from './RoomPlayer.js';


const Room = sequelize.define('Room', {
    id: { type: DataTypes.STRING(64), primaryKey: true },
    hostUserId: {
        type: DataTypes.STRING,
        allowNull: false,
        field: 'host_user_id' // 👈 Đây là phần quan trọng
    },

    questionSetId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        field: 'question_set_id'
    },
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        field: 'created_at'
    },
    startedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'started_at'
    },
    endedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'ended_at'
    },
    status: { type: DataTypes.ENUM('waiting', 'playing', 'finished'), defaultValue: 'waiting' }
}, {
    tableName: 'rooms',
    timestamps: false
});


Room.belongsTo(User, { foreignKey: 'host_user_id', as: 'host' });
Room.belongsTo(QuestionSet, { foreignKey: 'question_set_id', as: 'question_set' });

Room.hasMany(RoomPlayer, { foreignKey: 'room_id', as: 'players' });

export default Room;