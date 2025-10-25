// utils/player.js
export function makePublicPlayer(player){
  return {
    displayName: player.display_name || player.displayName,
    score: Number(player.score || 0),
    socketId: player.socket_id || player.socketId,
    userId: player.user_id || player.userId
  };
}
