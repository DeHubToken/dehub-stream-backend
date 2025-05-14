export enum SocketEvent {
  connection = 'connection',
  disconnect = 'disconnect',
  error = 'error',
  reConnect = 'reConnect', 
  sendMessage = 'chatbot:sendMessage',
  receiveResponse = 'chatbot:receiveResponse',
  typing = 'chatbot:typing',
  stopTyping = 'chatbot:stopTyping'
} 