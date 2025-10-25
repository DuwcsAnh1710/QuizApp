import { Room, RoomPlayer } from '../models/index.js';
import { v4 as uuidv4 } from 'uuid';

const memoryRooms = new Map(); // roomId -> room object
const codeToRoomId = new Map(); // roomCode -> roomId

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return codeToRoomId.has(code) ? generateRoomCode() : code;
}

/**
 * Tạo room mới
 */
export async function createRoom({ hostUserId = null, questionSetId = null }) {
  const id = uuidv4();
  const code = generateRoomCode();

  const room = {
    id,
    hostUserId,
    questionSetId,
    status: 'waiting',
    createdAt: new Date(),
    code,
    players: []
  };

  memoryRooms.set(id, room);
  codeToRoomId.set(code, id);

  try {
    await Room.create({
      id, hostUserId,
      question_set_id: questionSetId,
      status: 'waiting'
    });
  } catch (err) {
    console.error('Room.create failed (continuing with memory only):', err?.message || err);
  }

  return room; // ✅ Trả về toàn bộ room object
}

/**
 * Thêm player vào room (Memory + DB)
 */
export async function addPlayerToRoomDB({ roomId, userId = null, displayName, socketId, isHost = false }) {
  const player = await RoomPlayer.create({
    room_id: roomId,
    user_id: null,
    display_name: displayName,
    socket_id: socketId,
    score: 0
  });

  const room = memoryRooms.get(roomId);
  if (room) {
    room.players.push({
      id: player.id,
      displayName: player.display_name,
      socketId: player.socket_id,
      isHost
    });
  }

  return player.toJSON();
}

/**
 * Xóa player khỏi room (Memory + DB)
 */
export async function removePlayerFromRoomDB({ roomId, socketId }) {
  const player = await RoomPlayer.findOne({ where: { room_id: roomId, socket_id: socketId } });
  if (player) {
    await player.destroy();
    const room = memoryRooms.get(roomId);
    if (room) {
      room.players = room.players.filter(p => p.socketId !== socketId);
    }
    return true;
  }
  return false;
}

/**
 * Lấy room từ memory
 */
export function getRoomFromMemory(id) {
  return memoryRooms.get(id) || null;
}

/**
 * Lấy roomId từ mã phòng
 */
export function getRoomIdByCode(code) {
  return codeToRoomId.get(code) || null;
}

/**
 * Lấy mã phòng từ roomId
 */
export function getRoomCode(roomId) {
  const room = memoryRooms.get(roomId);
  return room?.code || null;
}

/**
 * Lấy room từ DB
 */
export async function getRoomFromDB(id) {
  try {
    const room = await Room.findByPk(id, {
      include: [{ model: RoomPlayer, as: 'players' }]
    });

    if (!room) return null;

    const roomData = room.toJSON();
    roomData.players = roomData.players.map(p => ({
      id: p.id,
      displayName: p.display_name,
      socketId: p.socket_id,
      isHost: p.user_id === roomData.host_user_id
    }));

    return roomData;
  } catch (err) {
    console.error('getRoomFromDB error:', err);
    return null;
  }
}


/**
 * Lấy room (memory trước, fallback DB)
 */
export async function getRoom(id) {
  return getRoomFromMemory(id) || await getRoomFromDB(id);
}

/**
 * Đổi trạng thái phòng
 */
export async function setRoomStatus(id, status) {
  const room = memoryRooms.get(id);
  if (room) room.status = status;
  await Room.update({ status }, { where: { id } });
  return room;
}

/**
 * Xóa phòng
 */
export async function removeRoom(id) {
  const room = memoryRooms.get(id);
  if (room?.code) codeToRoomId.delete(room.code);
  memoryRooms.delete(id);
  await Room.destroy({ where: { id } });
}

/**
 * Lấy danh sách phòng đang hoạt động
 */
export function getActiveRooms() {
  return Array.from(memoryRooms.values());
}

export default {
  createRoom,
  getRoom,
  getRoomFromMemory,
  getRoomFromDB,
  removeRoom,
  setRoomStatus,
  getActiveRooms,
  addPlayerToRoomDB,
  removePlayerFromRoomDB,
  getRoomIdByCode,
  getRoomCode
};
