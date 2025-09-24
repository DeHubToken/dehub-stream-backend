import { Injectable } from '@nestjs/common';
import { reqParam } from 'common/util/auth';
import { verifyFields } from 'common/util/misc';
import { paramNames } from 'config/constants';
import { Request, Response } from 'express';
import { AccountModel } from 'models/Account';
import { Notification } from 'models/Notifications';
import { normalizeAddress } from 'common/util/format';

// Supported notification types (keep strings to avoid frontend change)
type NotificationType = 'like' | 'dislike' | 'comment' | 'tip' | 'following' | 'videoRemoval';

interface CreateNotificationInput {
  recipentAddress: string;
  type: NotificationType;
  data: Record<string, any>;
}

interface AggregationResult {
  content: string;
  tokenId?: number | string;
}

// Public facing (lean) shape returned to frontend (avoid importing model interface to prevent path/type bloat)
interface NotificationView {
  _id: any;
  address: string;
  type: string;
  tokenId?: string | number;
  content: string;
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class NotificationsService {
  // Public HTTP handlers (kept for backward compatibility with existing controller & frontend)
  async createNotification(req: Request, res: Response) {
    try {
      const { userId, type, content, tokenId, senderAddress, tipAmount } = req.body; // legacy shape + optional fields
      if (!userId || !type) {
        return res.status(400).json({ error: 'userId and type are required' });
      }

      // If legacy simple content (no structured data) OR videoRemoval manual message
      const noStructuredData = !senderAddress && !tokenId && !tipAmount;
      if (noStructuredData) {
        if (typeof content !== 'string' || !content.trim()) {
          return res.status(400).json({ error: 'content is required for legacy notification creation' });
        }
        await Notification.create({ address: normalizeAddress(userId), type, content: content.trim() });
        return res.status(201).json({ message: 'Notification created successfully' });
      }

      // Build structured additionalData for new path
      const payload: any = { senderAddress };
      if (tokenId !== undefined) payload.tokenId = tokenId;
      if (tipAmount !== undefined) payload.tipAmount = tipAmount;
      if (content && typeof content === 'string') payload.content = content; // allow passing custom content if desired

      await this.createNotificationfunc(userId, type as NotificationType, payload);
      return res.status(201).json({ message: 'Notification created successfully' });
    } catch (error: any & { message: string }) {
      return res.status(500).json({ error: error.message });
    }
  }

  async getUnreadNotifications(req: Request, res: Response) {
    try {
      const address = reqParam(req, paramNames.address);
      const result = await this.getNotificationsFunc(address);
      return res.status(200).json({ result });
    } catch (error: any & { message: string }) {
      return res.status(500).json({ error: error.message });
    }
  }

  async markNotificationAsRead(req: Request, res: Response) {
    try {
      const notificationId = req.params.notificationId;
      await this.markNotificationAsReadFunc(notificationId);
      return res.status(200).json({ message: 'Notification marked as read' });
    } catch (error: any & { message: string }) {
      return res.status(500).json({ error: error.message });
    }
  }

  // Core creation - still exported under the same name to avoid frontend changes
  async createNotificationfunc(recipentAddress: string, type: NotificationType, additionalData: any) {
    try {
      this.validatePayload(type, additionalData);

      const normalizedRecipient = normalizeAddress(recipentAddress);
      const senderAddress = normalizeAddress(additionalData.senderAddress);
      const username = await this.resolveSenderUsername(senderAddress);

      // Build aggregation key (per type + optional tokenId) for like/dislike/comment to group, single tip/follow entry
      const { matchFilter, tokenId } = this.buildMatchFilter(type, normalizedRecipient, additionalData);

      // Build fresh content using current count/state
      const { content } = await this.buildContent({
        recipentAddress: normalizedRecipient,
        type,
        data: { ...additionalData, username },
      });

      // Atomic upsert (ensures no race duplicates). For types we aggregate (like/dislike/comment/following) we update existing unread entry; for tip we always insert new.
      if (this.isAggregatedType(type)) {
        await Notification.findOneAndUpdate(
          matchFilter,
          {
            $set: { content, tokenId },
            $setOnInsert: { address: normalizedRecipient, type, read: false },
            $currentDate: { updatedAt: true },
          },
          { new: true, upsert: true },
        ).lean();
      } else if (type === 'tip') {
        await Notification.create({ address: normalizedRecipient, type, tokenId, content });
      } else if (type === 'videoRemoval') {
        await Notification.create({ address: normalizedRecipient, type, tokenId, content });
      }
    } catch (error: any & { message: string }) {
      throw new Error(error.message);
    }
  }

  private validatePayload(type: NotificationType, data: Record<string, any>) {
    switch (type) {
      case 'like':
      case 'dislike':
      case 'comment':
        verifyFields(['senderAddress', 'tokenId'], data);
        break;
      case 'tip':
        verifyFields(['senderAddress', 'tipAmount'], data);
        break;
      case 'following':
        verifyFields(['senderAddress'], data);
        break;
      case 'videoRemoval':
        // no required extra fields yet
        break;
      default:
        throw new Error('Unknown notification type');
    }
  }

  private async resolveSenderUsername(address: string): Promise<string> {
    const account = await AccountModel.findOne({ address }, { username: 1, displayName: 1, address: 1 }).lean();
    if (!account) return address;
    return account.username || account.displayName || account.address;
  }

  private isAggregatedType(type: NotificationType) {
    return ['like', 'dislike', 'comment', 'following'].includes(type);
  }

  private buildMatchFilter(type: NotificationType, address: string, data: Record<string, any>) {
    const base: any = { address, type, read: false };
    if (['like', 'dislike', 'comment'].includes(type)) {
      base.tokenId = data.tokenId;
    }
    return { matchFilter: base, tokenId: base.tokenId };
  }

  private async buildContent(input: CreateNotificationInput): Promise<AggregationResult> {
    const { type, data } = input;
    const username = data.username;
    if (type === 'tip') {
      return { content: `${username} just tipped you ${data.tipAmount} BJ.` };
    }
    if (type === 'videoRemoval') {
      return {
        content:
          'This upload was removed due to reported copyright infringements. To appeal, email the associated NFT ID to tech@dehub.net - Remember, censorship-resistant by platform and contact with your audience, not by freedom to upload illegal or unlawful content.',
      };
    }

    // Aggregated types: compute existing unread count for same grouping
    const { matchFilter } = this.buildMatchFilter(type, normalizeAddress(input.recipentAddress), data);
    const existing = await Notification.find(matchFilter, { content: 1 }).lean();
    const count = existing.length; // number of existing aggregated notifications (0 means first)
    switch (type) {
      case 'like':
        return { content: this.aggregateSentence(username, count, 'liked your video') };
      case 'dislike':
        return { content: this.aggregateSentence(username, count, 'disliked your video') };
      case 'comment':
        return { content: this.aggregateSentence(username, count, 'commented on your video') };
      case 'following':
        return { content: this.aggregateSentence(username, count, 'started following you') };
      default:
        return { content: '' };
    }
  }

  private aggregateSentence(username: string, existingCount: number, base: string) {
    if (existingCount === 0) return `${username} ${base}.`;
    if (existingCount === 1) return `${username} and 1 other ${base}.`;
    return `${username} and ${existingCount} others ${base}.`;
  }

  async getNotificationsFunc(address: string): Promise<NotificationView[]> {
    try {
      const normalized = normalizeAddress(address);
      const docs = await Notification.find({ address: normalized, read: false })
        .limit(20)
        .sort({ updatedAt: -1 })
        .lean();
      return docs as unknown as NotificationView[];
    } catch (error: any & { message: string }) {
      throw new Error(`Error getting notifications: ${error.message}`);
    }
  }

  async markNotificationAsReadFunc(notificationId: string): Promise<void> {
    try {
      const notification = await Notification.findById(notificationId);
      if (!notification) throw new Error('Notification not found');
      notification.read = true;
      await notification.save();
    } catch (error: any & { message: string }) {
      throw new Error(`Error marking notification as read: ${error.message}`);
    }
  }
}
