import { Injectable } from '@nestjs/common';
import { reqParam } from 'common/util/auth';
import { paramNames } from 'config/constants';
import { Request, Response } from 'express';
import { AccountModel } from 'models/Account';
import { Notification } from 'models/Notifications';

@Injectable()
export class NotificationsService {
  async createNotification (req, res) {
    try {
      const { userId, type, content } = req.body;
      await this.createNotificationfunc(userId, type, content);
      res.status(201).json({ message: 'Notification created successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async getUnreadNotifications (req, res) {
    try {
      const address = reqParam(req, paramNames.address);
      const result = await this.getNotificationsFunc(address);
      res.status(200).json({ result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async markNotificationAsRead (req, res) {
    try {
      const notificationId = req.params.notificationId;
      await this.markNotificationAsReadFunc(notificationId);
      res.status(200).json({ message: 'Notification marked as read' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async  createNotificationfunc(recipentAddress, type, additionalData) {
    try {
      switch (type) {
        case 'like':
        case 'dislike':
        case 'comment':
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
      const account = await AccountModel.findOne({ address: additionalData.senderAddress }, {}).lean();
      if (account.username) {
        additionalData.username = account.username;
      } else if (account.displayName) {
        additionalData.username = account.displayName;
      } else {
        additionalData.username = account.address;
      }
  
      let content, payload, id;
      if (type === 'like' || type === 'dislike' || type === 'comment') {
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
          content = await this.generateLikeContent(recipentAddress, numExistingLikes, additionalData.username);
          break;
        case 'dislike':
          const numExistingDisLikes = existingNotifications.filter(e => e.type === 'dislike')?.length;
          content = await this.generateDislikeContent(recipentAddress, numExistingDisLikes, additionalData.username);
          break;
        case 'comment':
          const numExistingComment = existingNotifications.filter(e => e.type === 'comment')?.length;
          content = await this.generateCommentContent(recipentAddress, numExistingComment, additionalData.username);
          break;
        case 'tip':
          content = `${additionalData.username} just tipped you ${additionalData.tipAmount} BJ.`;
          break;
        case 'following':
          // content = `${additionalData.username} started following you.`;
          const numExistingFollows = await existingNotifications.filter(e => e.type === 'following')?.length;
          content = await this.generateFollowContent(recipentAddress, numExistingFollows, additionalData.username);
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
  
  async getNotificationsFunc(address:string) {
    try {
      // const notifications = await Notification.find({ address, read: false });
      address = address.toLowerCase();
      const result:any = await Notification.find({ address, read: false }).limit(20).sort({ updatedAt: -1 });
      return result;
    } catch (error) {
      throw new Error(`Error getting notifications: ${error.message}`);
    }
  }
  
  async  markNotificationAsReadFunc(notificationId:string) {
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

  async generateLikeContent(address, numExistingLikes, username) {
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
  
  async generateFollowContent(address, numExistingFollows, username) {
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
  
  async generateDislikeContent(address, numExistingDislikes, username) {
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
  
  async generateCommentContent(address, numExistingFollows, username) {
    if (numExistingFollows === 0) {
      return `${username} commented on your video.`;
    } else {
      const existingCommentNotification = await Notification.findOne({
        address,
        type: 'comment',
        read: false,
      });
  
      if (!existingCommentNotification) {
        return `${username} commented on your video.`;
      }
  
      const existingContent = existingCommentNotification.content;
      const match = existingContent.match(/(\w+) commented on your video/);
      if (match && match[1] !== username) {
        return `${username} and ${match[1]} commented on your video.`;
      } else if (existingContent.match(/(\w+) and \w+ commented on your video./)) {
        return `${username} and ${2} others commented on your video.`;
      } else if (existingContent.match(/(\w+) and \d+ commented on your video/)) {
        const numOthers = parseInt(existingContent.match(/(\w+) and (\d+) others commented on your video/)[2], 10);
        return `${username} and ${numOthers + 1} others commented on your video.`;
      } else {
        return `${username} commented on your video.`;
      }
    }
  }
}
