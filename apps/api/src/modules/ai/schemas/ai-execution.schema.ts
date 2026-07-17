import { Prop, raw, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import {
  AI_EXECUTION_STATUSES,
  type AiExecutionStatus,
  type AiExecutionToolCallDTO,
} from '@ai-projectos/shared';

export type AiExecutionDocument = HydratedDocument<AiExecution>;

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
export class AiExecution {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Organization', required: true, index: true })
  orgId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'ChatSession', default: null })
  sessionId?: Types.ObjectId | null;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'ChatMessage', default: null })
  messageId?: Types.ObjectId | null;

  @Prop({ type: String, required: true })
  prompt!: string;

  @Prop({ type: String, required: true })
  model!: string;

  @Prop({ type: String, required: true, enum: AI_EXECUTION_STATUSES })
  status!: AiExecutionStatus;

  @Prop({ type: String, default: '' })
  graphState!: string;

  @Prop({ type: [SchemaTypes.Mixed], default: [] })
  toolCalls!: AiExecutionToolCallDTO[];

  @Prop({ type: Number, default: 0 })
  latencyMs!: number;

  @Prop({ type: Number, default: 0 })
  iterations!: number;

  @Prop(raw({ _id: false, in: { type: Number, default: 0 }, out: { type: Number, default: 0 } }))
  tokens!: { in: number; out: number };
}

export const AiExecutionSchema = SchemaFactory.createForClass(AiExecution);
AiExecutionSchema.index({ orgId: 1, createdAt: -1 });
AiExecutionSchema.index({ userId: 1, createdAt: -1 });
