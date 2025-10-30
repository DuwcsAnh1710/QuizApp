import { DataTypes } from 'sequelize';
import sequelize from '../config/sequelize.js';
import Room from './Room.js';

const RoomPlayer = sequelize.define('RoomPlayer', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  room_id: { type: DataTypes.STRING(64), allowNull: false },
  user_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  display_name: { type: DataTypes.STRING(100), allowNull: false },
  socket_id: { type: DataTypes.STRING(255), allowNull: true },
  score: { type: DataTypes.DECIMAL(8, 2), allowNull: false, defaultValue: 0 },
  joined_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, {
  tableName: 'room_players',
  timestamps: false
});

RoomPlayer.associate = (models) => {
  RoomPlayer.belongsTo(models.Room, { foreignKey: 'room_id', as: 'room' });
};
export default RoomPlayer;
