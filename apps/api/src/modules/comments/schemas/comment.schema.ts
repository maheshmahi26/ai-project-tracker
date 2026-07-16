import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type CommentDocument = HydratedDocument<Comment>;

@Schema({
  timestamps: true,
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
export class Comment {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Organization', required: true, index: true })
  orgId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Task', required: true, index: true })
  taskId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  authorId!: Types.ObjectId;

  /** Rich-text body stored as an opaque JSON document (ProseMirror/TipTap). */
  @Prop({ type: SchemaTypes.Mixed, required: true })
  body!: Record<string, unknown>;

  @Prop({ type: [SchemaTypes.ObjectId], ref: 'User', default: [] })
  mentions!: Types.ObjectId[];

  @Prop({ type: Date, default: null })
  editedAt?: Date | null;

  @Prop({ default: false, index: true })
  isDeleted!: boolean;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export const CommentSchema = SchemaFactory.createForClass(Comment);
// Thread listing: a task's comments in chronological order.
CommentSchema.index({ orgId: 1, taskId: 1, createdAt: 1 });
