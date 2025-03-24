import { AccountModel } from "models/Account";

const onlineUsers = new Set();

// Not needed since reconnecting has been handled in case of a server restart
const initializeOnlineUsers = async () => {
  try {
    const onlineUsersFromDB = await AccountModel.find({ online: true }).select('address');
    onlineUsersFromDB.forEach(user => {
      onlineUsers.add(user.address);
    });
  } catch (error: any & { message: string }) {
    console.error('Error initializing onlineUsers:', error);
  }
};

const addUserToOnlineList = async userAddress => {
  onlineUsers.add(userAddress);
};

const removeUserFromOnlineList = async userAddress => {
  onlineUsers.delete(userAddress);
};

const getOnlineUsers = () => {
  return Array.from(onlineUsers);
};

export {
  initializeOnlineUsers,
  addUserToOnlineList,
  removeUserFromOnlineList,
  getOnlineUsers,
};
