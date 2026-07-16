import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, FilterQuery, Model, Types } from 'mongoose';
import { Notification, NotificationDocument } from './schemas/notification.schema';

export type NotificationLean = Notification & {
  _id: Types.ObjectId;
  createdAt: Date;
};

export interface NotificationListParams {
  orgId: string;
  userId: string;
  unreadOnly?: boolean;
  beforeId?: string;
  limit: number;
}

export abstract class NotificationsRepository {
  abstract createMany(
    data: Partial<Notification>[],
    session?: ClientSession,
  ): Promise<NotificationLean[]>;
  abstract listByUser(params: NotificationListParams): Promise<NotificationLean[]>;
  abstract markRead(orgId: string, userId: string, id: string): Promise<boolean>;
  abstract markAllRead(orgId: string, userId: string): Promise<number>;
  abstract countUnread(orgId: string, userId: string): Promise<number>;
}

@Injectable()
export class MongoNotificationsRepository extends NotificationsRepository {
  constructor(@InjectModel(Notification.name) private readonly model: Model<NotificationDocument>) {
    super();
  }

  async createMany(
    data: Partial<Notification>[],
    session?: ClientSession,
  ): Promise<NotificationLean[]> {
    if (data.length === 0) return [];
    const docs = await this.model.create(data, { session, ordered: true });
    return docs.map((d) => d.toObject() as unknown as NotificationLean);
  }

  listByUser(params: NotificationListParams): Promise<NotificationLean[]> {
    if (!Types.ObjectId.isValid(params.orgId) || !Types.ObjectId.isValid(params.userId)) {
      return Promise.resolve([]);
    }
    const filter: FilterQuery<NotificationDocument> = {
      orgId: new Types.ObjectId(params.orgId),
      userId: new Types.ObjectId(params.userId),
    };
    if (params.unreadOnly) filter.readAt = null;
    if (params.beforeId && Types.ObjectId.isValid(params.beforeId)) {
      filter._id = { $lt: new Types.ObjectId(params.beforeId) };
    }
    return this.model
      .find(filter)
      .sort({ _id: -1 })
      .limit(params.limit + 1)
      .lean<NotificationLean[]>()
      .exec();
  }

  async markRead(orgId: string, userId: string, id: string): Promise<boolean> {
    if (![orgId, userId, id].every((v) => Types.ObjectId.isValid(v))) return false;
    const res = await this.model
      .updateOne(
        { _id: id, orgId, userId, readAt: null },
        { $set: { readAt: new Date() } },
      )
      .exec();
    return res.modifiedCount > 0;
  }

  async markAllRead(orgId: string, userId: string): Promise<number> {
    if (!Types.ObjectId.isValid(orgId) || !Types.ObjectId.isValid(userId)) return 0;
    const res = await this.model
      .updateMany({ orgId, userId, readAt: null }, { $set: { readAt: new Date() } })
      .exec();
    return res.modifiedCount;
  }

  countUnread(orgId: string, userId: string): Promise<number> {
    if (!Types.ObjectId.isValid(orgId) || !Types.ObjectId.isValid(userId)) return Promise.resolve(0);
    return this.model.countDocuments({ orgId, userId, readAt: null }).exec();
  }
}
