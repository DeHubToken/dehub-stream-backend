const { Notification } = require('../models/Notifications');
const { Account } = require('../models/Account');
const { verifyFields } = require('../utils/misc');
const { Token } = require('../models/Token');

async function createNotification(recipentAddress, type, additionalData) {
  try {
    switch (type) {
      case 'like':
      case 'dislike':
        verifyFields(['senderAddress', 'tokenId'], additionalData);
        break;
      case 'tip':
        verifyFields(['senderAddress', 'tipAmount'], additionalData);
        break;
      case 'following':
        verifyFields(['senderAddress'], additionalData);
        break;
      case 'videoRemoval':
        // Not yet
        break;
      default:
        throw new Error('Unknown notification type');
    }

    // Notification trigger address/username
    additionalData.senderAddress = additionalData.senderAddress.toLowerCase();
    recipentAddress = recipentAddress.toLowerCase();
    const account = await Account.findOne({ address: additionalData.senderAddress }, {}).lean();
    if (account.username) {
      additionalData.username = account.username;
    } else if (account.displayName) {
      additionalData.username = account.displayName;
    } else {
      additionalData.username = address;
    }

    let content, payload, id;
    if (type === 'like' || type === 'dislike') {
      payload = {
        address: recipentAddress,
        type: { $in: [type] },
        tokenId: additionalData.tokenId,
        read: false,
      };
      id = additionalData.tokenId;
    } else {
      payload = {
        address: recipentAddress,
        type: { $in: ['following'] },
        read: false,
      };
    }
    const existingNotifications = await Notification.find(payload);

    switch (type) {
      case 'like':
        const numExistingLikes = existingNotifications.filter(e => e.type === 'like')?.length;
        content = await generateLikeContent(recipentAddress, numExistingLikes, additionalData.username);
        break;
      case 'dislike':
        const numExistingDisLikes = existingNotifications.filter(e => e.type === 'dislike')?.length;
        content = await generateDislikeContent(recipentAddress, numExistingDisLikes, additionalData.username);
        break;
      case 'tip':
        content = `${additionalData.username} just tipped you ${additionalData.tipAmount} DHB.`;
        break;
      case 'following':
        // content = `${additionalData.username} started following you.`;
        numExistingFollows = await existingNotifications.filter(e => e.type === 'following')?.length;
        content = await generateFollowContent(recipentAddress, numExistingFollows, additionalData.username);
        break;
      case 'videoRemoval':
        // Not yet
        content =
          'This upload was removed due to reported copyright infringements. To appeal, email the associated NFT ID to tech@dehub.net - Remember, censorship-resistant by platform and contact with your audience, not by freedom to upload illegal or unlawful content.';
        break;
      default:
        throw new Error('Unknown notification type');
    }
    const existingNotification = await Notification.findOneAndUpdate(
      payload,
      { content }, // Update the content field as needed
      { new: true },
    );

    if (!existingNotification) {
      // Create a new notification if none exist
      const notification = new Notification({
        address: recipentAddress,
        type,
        tokenId: id,
        content,
      });

      await notification.save();
    }
  } catch (error) {
    throw new Error(error.message);
  }
}

async function getNotifications(address) {
  try {
    // const notifications = await Notification.find({ address, read: false });
    address = address.toLowerCase();
    const result = await Notification.find({ address, read: false }).limit(20).sort({ updatedAt: -1 });
    return result;
  } catch (error) {
    throw new Error(`Error getting notifications: ${error.message}`);
  }
}

async function markNotificationAsRead(notificationId) {
  try {
    const notification = await Notification.findById(notificationId);
    if (!notification) {
      throw new Error('Notification not found');
    }

    notification.read = true;
    await notification.save();
  } catch (error) {
    throw new Error(`Error marking notification as read: ${error.message}`);
  }
}

async function generateLikeContent(address, numExistingLikes, username) {
  if (numExistingLikes === 0) {
    return `${username} liked your video.`;
  } else {
    const existingLikeNotification = await Notification.findOne({
      address,
      type: 'like',
      read: false,
    });

    if (!existingLikeNotification) {
      return `${username} liked your video.`;
    }

    const existingContent = existingLikeNotification.content;
    const match = existingContent.match(/(\w+) liked your video/);
    console.log(existingContent);
    if (match && match[1] !== username) {
      return `${username} and ${match[1]} liked your video.`;
    } else if (existingContent.match(/(\w+) and \w+ liked your video./)) {
      return `${username} and ${2} others liked your video.`;
    } else if (existingContent.match(/(\w+) and \d+ others liked your video/)) {
      const numOthers = parseInt(existingContent.match(/(\w+) and (\d+) others liked your video/)[2], 10);
      return `${username} and ${numOthers + 1} others liked your video.`;
    } else {
      return `${username} liked your video.`;
    }
  }
}

async function generateFollowContent(address, numExistingFollows, username) {
  if (numExistingFollows === 0) {
    return `${username} started following you.`;
  } else {
    const existingFollowNotification = await Notification.findOne({
      address,
      type: 'following',
      read: false,
    });

    if (!existingFollowNotification) {
      return `${username} started following you.`;
    }

    const existingContent = existingFollowNotification.content;
    const match = existingContent.match(/(\w+) started following you/);
    if (match && match[1] !== username) {
      return `${username} and ${match[1]} started following you.`;
    } else if (existingContent.match(/(\w+) and \w+ started following you./)) {
      return `${username} and ${2} others started following you.`;
    } else if (existingContent.match(/(\w+) and \d+ others started following you/)) {
      const numOthers = parseInt(existingContent.match(/(\w+) and (\d+) others started following you/)[2], 10);
      return `${username} and ${numOthers + 1} others started following you.`;
    } else {
      return `${username} started following you.`;
    }
  }
}

async function generateDislikeContent(address, numExistingDislikes, username) {
  if (numExistingDislikes === 0) {
    return `${username} disliked your video.`;
  } else {
    const existingDislikeNotification = await Notification.findOne({
      address,
      type: 'dislike',
      read: false,
    });

    if (!existingDislikeNotification) {
      return `${username} disliked your video.`;
    }

    const existingContent = existingDislikeNotification.content;
    const match = existingContent.match(/(\w+) disliked your video/);
    if (match && match[1] !== username) {
      return `${username} and ${match[1]} disliked your video.`;
    } else if (existingContent.match(/(\w+) and \w+ disliked your video./)) {
      return `${username} and ${2} others disliked your video.`;
    } else if (existingContent.match(/(\w+) and \d+ others disliked your video/)) {
      const numOthers = parseInt(existingContent.match(/(\w+) and (\d+) others disliked your video/)[2], 10);
      return `${username} and ${numOthers + 1} others disliked your video.`;
    } else {
      return `${username} disliked your video.`;
    }
  }
}

module.exports = {
  createNotification,
  getNotifications,
  markNotificationAsRead,
};
