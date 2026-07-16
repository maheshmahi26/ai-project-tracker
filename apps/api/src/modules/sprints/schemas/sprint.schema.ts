import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type SprintDocument = HydratedDocument<Sprint>;

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
export class Sprint {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Organization', required: true, index: true })
  orgId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Project', required: true, index: true })
  projectId!: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: String, default: null })
  goal?: string | null;

  @Prop({
    type: String,
    required: true,
    enum: ['planned', 'active', 'completed'],
    default: 'planned',
    index: true,
  })
  status!: 'planned' | 'active' | 'completed';

  @Prop({ type: Date, default: null })
  startDate?: Date | null;

  @Prop({ type: Date, default: null })
  endDate?: Date | null;

  @Prop({ type: Number, default: null })
  capacityPoints?: number | null;

  @Prop({ type: Number, default: 0 })
  committedPoints!: number;

  @Prop({ type: Number, default: 0 })
  completedPoints!: number;

  @Prop({ default: false, index: true })
  isDeleted!: boolean;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export const SprintSchema = SchemaFactory.createForClass(Sprint);
SprintSchema.index({ orgId: 1, projectId: 1, status: 1 });
