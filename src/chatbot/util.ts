import Redis from 'ioredis';
import { config } from 'config';

// Singleton Redis client
let redisClientInstance: Redis | null = null;

/**
 * Initialize Redis client for chatbot sessions
 * @returns Redis client
 */
export const createRedisClient = (): Redis => {
  if (!redisClientInstance) {
    redisClientInstance = new Redis({
      ...config.redis,
      db: 3, // Use a separate DB index for chatbot
    });
  }
  return redisClientInstance;
};

/**
 * Save a session for a user
 * @param redisClient Redis client
 * @param userAddress User wallet address
 * @param socketId Socket ID
 * @param userId User ID from database
 */
export const saveUserSession = async (
  redisClient: Redis,
  userAddress: string,
  socketId: string,
  userId: string,
  username: string,
) => {
 try {
    const redisKey = `chatbot:user:${userAddress.toLowerCase()}`;
    const sessionData = await redisClient.get(redisKey);
    const session = sessionData ? JSON.parse(sessionData) : {
      username,
      address: userAddress.toLowerCase(),
      _id: userId,
      socketIds: [],
    };

    // Add the socket ID if it doesn't exist
    if (!session.socketIds.includes(socketId)) {
      session.socketIds.push(socketId);
    }

    // Save in Redis with 24-hour expiration
    await redisClient.set(redisKey, JSON.stringify(session), 'EX', 86400);
 } catch (error) {
   console.error('Failed to save user session:', error);
   throw new Error(`Failed to save session for user ${userAddress}: ${error.message}`);
 }
};

/**
 * Remove a socket ID from a user session
 * @param redisClient Redis client
 * @param userAddress User wallet address
 * @param socketId Socket ID to remove
/**
 * Generate Redis key for a user session
 * @param userAddress User wallet address
 * @returns Redis key string
 */
export const getUserSessionKey = (userAddress: string) => {
  return `chatbot:user:${userAddress.toLowerCase()}`;
};

export const removeSocketFromSession = async (
  redisClient: Redis,
  userAddress: string,
  socketId: string,
) => {
 try {
   const redisKey = getUserSessionKey(userAddress);
   const sessionData = await redisClient.get(redisKey);
   
   if (sessionData) {
     const session = JSON.parse(sessionData);
     
     if (session) {
       // Remove the socket ID
       session.socketIds = session.socketIds.filter((id: string) => id !== socketId);

       if (session.socketIds.length > 0) {
         // Update Redis if there are still sockets
         await redisClient.set(redisKey, JSON.stringify(session), 'EX', 86400);
       } else {
         // Remove the session if no sockets remain
         await redisClient.del(redisKey);
       }
     }
   }
 } catch (error) {
   console.error('Failed to remove socket from session:', error);
   throw new Error(`Failed to remove socket for user ${userAddress}: ${error.message}`);
 }
};