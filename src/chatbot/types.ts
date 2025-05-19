// Add new socket events for our multi-conversation functionality
export enum ChatbotSocketEvent {
  // Existing events from SocketEvent enum
  SEND_MESSAGE = 'chatbot:sendMessage',
  RECEIVE_MESSAGE = 'chatbot:receiveMessage',
  TYPING = 'chatbot:typing',
  STOP_TYPING = 'chatbot:stopTyping',
  // New events
  CREATE_CONVERSATION = 'chatbot:createConversation',
  CONVERSATION_CREATED = 'chatbot:conversationCreated',
  GET_CONVERSATIONS = 'chatbot:getConversations',
  CONVERSATIONS_LIST = 'chatbot:conversationsList',
  GET_MESSAGES = 'chatbot:getMessages',
  MESSAGES_LIST = 'chatbot:messagesList',
  ERROR = 'chatbot:error',
  MESSAGE_SENT_ACK = 'chatbot:messageSentAck',
  // Image generation events
  GENERATE_IMAGE = 'chatbot:generateImage',
  IMAGE_READY = 'chatbot:imageReady',
  IMAGE_ERROR = 'chatbot:imageError',
}