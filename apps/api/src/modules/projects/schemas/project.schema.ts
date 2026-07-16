import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type ProjectDocument = HydratedDocument<Project>;

@Schema({ _id: false })
export class ProjectCounters {
  @Prop({ type: Number, default: 0 })
  taskSeq!: number;
}
const ProjectCountersSchema = SchemaFactory.createForClass(ProjectCounters);

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
export class Project {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Organization', required: true, index: true })
  orgId!: Types.ObjectId;

  @Prop({ type: String, required: true, uppercase: true, trim: true })
  key!: string;

  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: String, default: null })
  description?: string | null;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', default: null })
  leadId?: Types.ObjectId | null;

  @Prop({ type: String, required: true, enum: ['active', 'archived'], default: 'active', index: true })
  status!: 'active' | 'archived';

  @Prop({ type: String, default: '#4f46e5' })
  color!: string;

  @Prop({ type: Date, default: null })
  startDate?: Date | null;

  @Prop({ type: Date, default: null })
  targetDate?: Date | null;

  @Prop({ type: ProjectCountersSchema, default: () => ({ taskSeq: 0 }) })
  counters!: ProjectCounters;

  @Prop({ default: false, index: true })
  isDeleted!: boolean;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export const ProjectSchema = SchemaFactory.createForClass(Project);
// Human key unique per org (only among non-deleted docs).
ProjectSchema.index(
  { orgId: 1, key: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } },
);
ProjectSchema.index({ orgId: 1, status: 1, isDeleted: 1 });
// Full-text search over name + description.
ProjectSchema.index({ name: 'text', description: 'text' });
