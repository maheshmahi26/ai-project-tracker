import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type LabelDocument = HydratedDocument<Label>;

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
export class Label {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Organization', required: true, index: true })
  orgId!: Types.ObjectId;

  /** null → org-wide label; otherwise scoped to a single project. */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Project', default: null })
  projectId?: Types.ObjectId | null;

  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: String, required: true })
  color!: string;
}

export const LabelSchema = SchemaFactory.createForClass(Label);
LabelSchema.index({ orgId: 1, projectId: 1, name: 1 }, { unique: true });
