const socketService = require('../services/SocketService'); // Import your notification service

const webSockets = (socket, io) => {
  socket.on('join', async userAddress => {
    if (userAddress) {
      await socketService.addUserToOnlineList(userAddress?.toLowerCase());
      io.emit('update-online-users', socketService.getOnlineUsers());
    }
  });

  socket.on('disconnect', async () => {
    const userAddress = socket.handshake.query.address;
    await socketService.removeUserFromOnlineList(userAddress?.toLowerCase());
    io.emit('update-online-users', socketService.getOnlineUsers());
  });
};

module.exports = webSockets;
