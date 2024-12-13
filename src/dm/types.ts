import { Namespace } from 'socket.io';

export const SocketEvent = {
  disconnect: 'disconnect',
  connection: 'connection',
  fetchMessage: 'fetchMessage',
  ping: 'ping',
  pong: 'pong',
  createAndStart: 'createAndStart',
  fetchDMessages: 'fetchDMessages',
  sendMessage: "sendMessage",
  error: 'error'
};
