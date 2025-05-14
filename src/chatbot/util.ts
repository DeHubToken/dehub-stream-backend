import Redis from 'ioredis';
import { config } from 'config';

/**
 * Initialize Redis client for chatbot sessions
 * @returns Redis client
 */
export const createRedisClient = () => {
  return new Redis({
    ...config.redis,
    db: 3, // Use a separate DB index for chatbot
  });
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
  const redisKey = `chatbot:user:${userAddress.toLowerCase()}`;
  const session = JSON.parse(await redisClient.get(redisKey)) || {
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
};

/**
 * Remove a socket ID from a user session
 * @param redisClient Redis client
 * @param userAddress User wallet address
 * @param socketId Socket ID to remove
 */
export const removeSocketFromSession = async (
  redisClient: Redis,
  userAddress: string,
  socketId: string,
) => {
  const redisKey = `chatbot:user:${userAddress.toLowerCase()}`;
  const session = JSON.parse(await redisClient.get(redisKey));

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
}; 