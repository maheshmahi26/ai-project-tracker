import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type TaskDocument = HydratedDocument<Task>;

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
export class Task {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Organization', required: true, index: true })
  orgId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Project', required: true, index: true })
  projectId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Sprint', default: null })
  sprintId?: Types.ObjectId | null;

  @Prop({ type: String, required: true, uppercase: true, trim: true })
  key!: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Task', default: null, index: true })
  parentId?: Types.ObjectId | null;

  @Prop({ type: String, required: true, trim: true })
  title!: string;

  @Prop({ type: String, default: null })
  description?: string | null;

  @Prop({
    type: String,
    required: true,
    enum: ['story', 'task', 'bug'],
    default: 'task',
  })
  type!: 'story' | 'task' | 'bug';

  @Prop({
    type: String,
    required: true,
    enum: ['backlog', 'todo', 'in_progress', 'in_review', 'done'],
    default: 'backlog',
  })
  status!: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done';

  @Prop({
    type: String,
    required: true,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
  })
  priority!: 'low' | 'medium' | 'high' | 'urgent';

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', default: null })
  assigneeId?: Types.ObjectId | null;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  reporterId!: Types.ObjectId;

  @Prop({ type: [SchemaTypes.ObjectId], ref: 'Label', default: [] })
  labelIds!: Types.ObjectId[];

  @Prop({ type: Number, default: null })
  storyPoints?: number | null;

  @Prop({ type: Date, default: null })
  dueDate?: Date | null;

  @Prop({ type: Number, default: 0 })
  order!: number;

  @Prop({ type: Number, default: 0 })
  attachmentsCount!: number;

  @Prop({ type: Number, default: 0 })
  commentsCount!: number;

  @Prop({ default: false, index: true })
  isDeleted!: boolean;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export const TaskSchema = SchemaFactory.createForClass(Task);
// Board ordering + common filters.
TaskSchema.index({ orgId: 1, projectId: 1, status: 1, order: 1 });
TaskSchema.index({ orgId: 1, sprintId: 1 });
TaskSchema.index({ orgId: 1, assigneeId: 1, status: 1 });
// Human key unique per org (only among non-deleted docs).
TaskSchema.index(
  { orgId: 1, key: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } },
);
// Full-text search over title + description.
TaskSchema.index({ title: 'text', description: 'text' });
