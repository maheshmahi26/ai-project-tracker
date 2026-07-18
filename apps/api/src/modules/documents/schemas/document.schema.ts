import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { DOCUMENT_SOURCE_TYPES, DOCUMENT_STATUSES } from '@ai-projectos/shared';

export type DocumentDocument = HydratedDocument<DocEntity>;

@Schema({
  collection: 'documents',
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
export class DocEntity {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Organization', required: true, index: true })
  orgId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  uploaderId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Project', default: null })
  projectId?: Types.ObjectId | null;

  @Prop({ type: String, required: true })
  title!: string;

  @Prop({ type: String, enum: DOCUMENT_SOURCE_TYPES, required: true })
  sourceType!: (typeof DOCUMENT_SOURCE_TYPES)[number];

  @Prop({ type: String, required: true })
  storageKey!: string;

  @Prop({ type: Number, required: true })
  sizeBytes!: number;

  @Prop({ type: String, enum: DOCUMENT_STATUSES, default: 'uploaded', index: true })
  status!: (typeof DOCUMENT_STATUSES)[number];

  @Prop({ type: Number, default: 0 })
  chunkCount!: number;

  @Prop({ type: String, default: null })
  error?: string | null;

  @Prop({ default: false, index: true })
  isDeleted!: boolean;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export const DocumentSchema = SchemaFactory.createForClass(DocEntity);
DocumentSchema.index({ orgId: 1, status: 1 });
DocumentSchema.index({ orgId: 1, projectId: 1 });
