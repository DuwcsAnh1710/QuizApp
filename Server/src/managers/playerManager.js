import { RoomPlayer } from '../models/index.js';

const memoryPlayers = new Map(); // socketId -> player object

/**
 * Thêm player vào memory và DB
 */
export async function addPlayer(socketId, { name, roomId, userId = null }) {
  if (!socketId || !name) throw new Error('socketId and name are required');

  // Tạo object memory
  const player = {
    socketId,
    name: name.trim(),
    roomId,
    userId,
    score: 0,
    joinedAt: new Date()
  };
  memoryPlayers.set(socketId, player);

  // Persist vào DB
  try {
    await RoomPlayer.create({
      room_id: roomId,
      user_id: userId,
      display_name: name,
      socket_id: socketId,
      score: 0
    });
  } catch (err) {
    // DB có thể chưa sẵn sàng; vẫn tiếp tục với memory
    // console.error('Persist player failed (memory only):', err?.message || err);
  }

  return player;
}

/**
 * Xóa player khỏi memory và DB
 */
export async function removePlayer(socketId) {
  const player = memoryPlayers.get(socketId);
  if (player) {
    try {
      await RoomPlayer.destroy({ where: { socket_id: socketId } });
    } catch (err) {
      // Bỏ qua lỗi DB khi cleanup
    }
    memoryPlayers.delete(socketId);
    return true;
  }
  return false;
}

/**
 * Lấy player từ memory
 */
export function getPlayerFromMemory(socketId) {
  return memoryPlayers.get(socketId) || null;
}

/**
 * Lấy player từ DB
 */
export async function getPlayerFromDB(socketId) {
  return await RoomPlayer.findOne({ where: { socket_id: socketId } });
}

/**
 * Lấy tất cả players trong 1 room (memory)
 */
export function getPlayersInRoom(roomId) {
  return Array.from(memoryPlayers.values()).filter(p => p.roomId === roomId);
}

/**
 * Cộng điểm cho player
 */
export async function addPlayerScore(socketId, points) {
  const player = memoryPlayers.get(socketId);
  if (!player) return null;

  const pointsToAdd = Number(points || 0);
  if (!Number.isFinite(pointsToAdd)) return null;

  player.score += pointsToAdd;

  await RoomPlayer.update(
    { score: player.score },
    { where: { room_id: player.roomId, socket_id: socketId } }
  );

  return player.score;
}

/**
 * Reset toàn bộ điểm trong 1 room (memory + DB)
 */
export async function resetRoomScores(roomId) {
  for (let player of memoryPlayers.values()) {
    if (player.roomId === roomId) {
      player.score = 0;
    }
  }
  await RoomPlayer.update({ score: 0 }, { where: { room_id: roomId } });
}

/**
 * Lấy bảng xếp hạng (từ memory để nhanh)
 */
export function getRanking(roomId) {
  return getPlayersInRoom(roomId)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .map((p, i) => ({
      rank: i + 1,
      name: p.name,
      score: p.score,
      socketId: p.socketId
    }));
}

/**
 * Lấy tất cả players (memory)
 */
export function getAllPlayers() {
  return Array.from(memoryPlayers.values());
}

/**
 * Đếm tổng số players (memory)
 */
export function getPlayerCount() {
  return memoryPlayers.size;
}

/**
 * Đếm số players trong 1 room
 */
export function getRoomPlayerCount(roomId) {
  return getPlayersInRoom(roomId).length;
}

/**
 * Kiểm tra player có trong room không (memory)
 */
export function isPlayerInRoom(socketId, roomId) {
  const p = memoryPlayers.get(socketId);
  return !!(p && p.roomId === roomId);
}

/**
 * Lấy danh sách tất cả room đang có player (memory)
 */
export function getActiveRooms() {
  const rooms = new Set();
  for (let p of memoryPlayers.values()) {
    if (p.roomId) rooms.add(p.roomId);
  }
  return Array.from(rooms);
}

/**
 * Xóa toàn bộ players (memory + DB)
 */
export async function clearAllPlayers() {
  memoryPlayers.clear();
  await RoomPlayer.destroy({ where: {} });
}
export default {
  addPlayer,
  removePlayer,
  getPlayerFromMemory,
  getPlayerFromDB,
  getPlayersInRoom,
  addPlayerScore,
  resetRoomScores,
  getRanking,
  getAllPlayers,
  getPlayerCount,
  getRoomPlayerCount,
  isPlayerInRoom,
  getActiveRooms,
  clearAllPlayers,
};



