const { Account } = require('../models/Account');

const onlineUsers = new Set();

// Not needed since reconnecting has been handled in case of a server restart
const initializeOnlineUsers = async () => {
  try {
    const onlineUsersFromDB = await Account.find({ online: true }).select('address');
    onlineUsersFromDB.forEach(user => {
      onlineUsers.add(user.address);
    });
  } catch (error) {
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

module.exports = {
  initializeOnlineUsers,
  addUserToOnlineList,
  removeUserFromOnlineList,
  getOnlineUsers,
};
