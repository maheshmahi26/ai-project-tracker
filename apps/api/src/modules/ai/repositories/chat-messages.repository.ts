import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, FilterQuery, Model, Types } from 'mongoose';
import { ChatMessage, ChatMessageDocument } from '../schemas/chat-message.schema';

export type ChatMessageLean = ChatMessage & {
  _id: Types.ObjectId;
  createdAt: Date;
};

export interface ChatMessageListParams {
  orgId: string;
  sessionId: string;
  beforeId?: string;
  limit: number;
}

export abstract class ChatMessagesRepository {
  abstract create(data: Partial<ChatMessage>, session?: ClientSession): Promise<ChatMessageLean>;
  /** Newest-first page (for the message list, cursor-paginated). */
  abstract list(params: ChatMessageListParams): Promise<ChatMessageLean[]>;
  /** Oldest→newest window used to build agent conversation context. */
  abstract recentForContext(
    orgId: string,
    sessionId: string,
    limit: number,
  ): Promise<ChatMessageLean[]>;
}

const valid = (...ids: string[]): boolean => ids.every((id) => Types.ObjectId.isValid(id));

@Injectable()
export class MongoChatMessagesRepository extends ChatMessagesRepository {
  constructor(@InjectModel(ChatMessage.name) private readonly model: Model<ChatMessageDocument>) {
    super();
  }

  async create(data: Partial<ChatMessage>, session?: ClientSession): Promise<ChatMessageLean> {
    const [doc] = await this.model.create([data], { session });
    return doc.toObject() as unknown as ChatMessageLean;
  }

  list(params: ChatMessageListParams): Promise<ChatMessageLean[]> {
    if (!valid(params.orgId, params.sessionId)) return Promise.resolve([]);
    const filter: FilterQuery<ChatMessageDocument> = {
      orgId: new Types.ObjectId(params.orgId),
      sessionId: new Types.ObjectId(params.sessionId),
    };
    if (params.beforeId && Types.ObjectId.isValid(params.beforeId)) {
      filter._id = { $lt: new Types.ObjectId(params.beforeId) };
    }
    return this.model
      .find(filter)
      .sort({ _id: -1 })
      .limit(params.limit + 1)
      .lean<ChatMessageLean[]>()
      .exec();
  }

  async recentForContext(
    orgId: string,
    sessionId: string,
    limit: number,
  ): Promise<ChatMessageLean[]> {
    if (!valid(orgId, sessionId)) return [];
    const rows = await this.model
      .find({ orgId: new Types.ObjectId(orgId), sessionId: new Types.ObjectId(sessionId) })
      .sort({ _id: -1 })
      .limit(limit)
      .lean<ChatMessageLean[]>()
      .exec();
    return rows.reverse();
  }
}
