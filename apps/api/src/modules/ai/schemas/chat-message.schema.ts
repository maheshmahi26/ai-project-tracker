import { Prop, raw, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import {
  CHAT_MESSAGE_ROLES,
  type ChatMessageRole,
  type ChatToolCallDTO,
  type ChatToolResultDTO,
} from '@ai-projectos/shared';

export type ChatMessageDocument = HydratedDocument<ChatMessage>;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  },
})
export class ChatMessage {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Organization', required: true, index: true })
  orgId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'ChatSession', required: true })
  sessionId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, required: true, enum: CHAT_MESSAGE_ROLES })
  role!: ChatMessageRole;

  @Prop({ type: String, default: '' })
  content!: string;

  @Prop({ type: [SchemaTypes.Mixed], default: undefined })
  toolCalls?: ChatToolCallDTO[];

  @Prop({ type: [SchemaTypes.Mixed], default: undefined })
  toolResults?: ChatToolResultDTO[];

  @Prop(raw({ _id: false, in: { type: Number }, out: { type: Number } }))
  tokens?: { in: number; out: number } | null;
}

export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessage);
ChatMessageSchema.index({ orgId: 1, sessionId: 1, createdAt: 1 });
