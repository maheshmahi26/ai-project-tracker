import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, FilterQuery, Model, Types } from 'mongoose';
import { ChatSession, ChatSessionDocument } from '../schemas/chat-session.schema';

export type ChatSessionLean = ChatSession & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export interface ChatSessionListParams {
  orgId: string;
  userId: string;
  beforeId?: string;
  limit: number;
}

export abstract class ChatSessionsRepository {
  abstract create(data: Partial<ChatSession>): Promise<ChatSessionLean>;
  abstract findById(orgId: string, userId: string, id: string): Promise<ChatSessionLean | null>;
  abstract list(params: ChatSessionListParams): Promise<ChatSessionLean[]>;
  abstract update(
    orgId: string,
    userId: string,
    id: string,
    patch: Partial<ChatSession>,
  ): Promise<ChatSessionLean | null>;
  abstract touch(id: string, addedMessages: number, session?: ClientSession): Promise<void>;
  abstract softDelete(orgId: string, userId: string, id: string): Promise<boolean>;
}

const valid = (...ids: string[]): boolean => ids.every((id) => Types.ObjectId.isValid(id));

@Injectable()
export class MongoChatSessionsRepository extends ChatSessionsRepository {
  constructor(@InjectModel(ChatSession.name) private readonly model: Model<ChatSessionDocument>) {
    super();
  }

  async create(data: Partial<ChatSession>): Promise<ChatSessionLean> {
    const doc = await this.model.create(data);
    return doc.toObject() as unknown as ChatSessionLean;
  }

  findById(orgId: string, userId: string, id: string): Promise<ChatSessionLean | null> {
    if (!valid(orgId, userId, id)) return Promise.resolve(null);
    return this.model
      .findOne({ _id: id, orgId, userId, isDeleted: false })
      .lean<ChatSessionLean>()
      .exec();
  }

  list(params: ChatSessionListParams): Promise<ChatSessionLean[]> {
    if (!valid(params.orgId, params.userId)) return Promise.resolve([]);
    const filter: FilterQuery<ChatSessionDocument> = {
      orgId: new Types.ObjectId(params.orgId),
      userId: new Types.ObjectId(params.userId),
      isDeleted: false,
    };
    if (params.beforeId && Types.ObjectId.isValid(params.beforeId)) {
      filter._id = { $lt: new Types.ObjectId(params.beforeId) };
    }
    return this.model
      .find(filter)
      .sort({ _id: -1 })
      .limit(params.limit + 1)
      .lean<ChatSessionLean[]>()
      .exec();
  }

  update(
    orgId: string,
    userId: string,
    id: string,
    patch: Partial<ChatSession>,
  ): Promise<ChatSessionLean | null> {
    if (!valid(orgId, userId, id)) return Promise.resolve(null);
    return this.model
      .findOneAndUpdate({ _id: id, orgId, userId, isDeleted: false }, { $set: patch }, { new: true })
      .lean<ChatSessionLean>()
      .exec();
  }

  async touch(id: string, addedMessages: number, session?: ClientSession): Promise<void> {
    if (!Types.ObjectId.isValid(id)) return;
    await this.model
      .updateOne(
        { _id: id },
        { $inc: { messageCount: addedMessages }, $set: { lastMessageAt: new Date() } },
        { session },
      )
      .exec();
  }

  async softDelete(orgId: string, userId: string, id: string): Promise<boolean> {
    if (!valid(orgId, userId, id)) return false;
    const res = await this.model
      .updateOne({ _id: id, orgId, userId, isDeleted: false }, { $set: { isDeleted: true } })
      .exec();
    return res.modifiedCount > 0;
  }
}
