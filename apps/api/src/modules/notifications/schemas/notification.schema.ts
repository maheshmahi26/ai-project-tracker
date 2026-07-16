import { Prop, raw, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { NOTIFICATION_TYPES } from '@ai-projectos/shared';

export type NotificationDocument = HydratedDocument<Notification>;

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
export class Notification {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Organization', required: true, index: true })
  orgId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, required: true, enum: NOTIFICATION_TYPES })
  type!: (typeof NOTIFICATION_TYPES)[number];

  @Prop({ type: String, required: true })
  title!: string;

  @Prop({ type: String, default: null })
  body?: string | null;

  @Prop(
    raw({
      _id: false,
      type: { type: String },
      id: { type: String },
    }),
  )
  entity?: { type: string; id: string } | null;

  @Prop({ type: Date, default: null })
  readAt?: Date | null;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
// Primary access pattern: a user's inbox, newest first, unread filterable.
NotificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });
NotificationSchema.index({ orgId: 1, userId: 1, createdAt: -1 });
