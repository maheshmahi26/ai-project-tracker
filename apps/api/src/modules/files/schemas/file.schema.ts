import { Prop, raw, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { FILE_SCOPE_TYPES } from '@ai-projectos/shared';

export type FileDocument = HydratedDocument<FileAsset>;

@Schema({
  collection: 'files',
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
export class FileAsset {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Organization', required: true, index: true })
  orgId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  uploaderId!: Types.ObjectId;

  @Prop(
    raw({
      _id: false,
      type: { type: String, enum: FILE_SCOPE_TYPES, required: true },
      id: { type: String, required: true },
    }),
  )
  scope!: { type: (typeof FILE_SCOPE_TYPES)[number]; id: string };

  @Prop({ type: String, required: true })
  fileName!: string;

  @Prop({ type: String, required: true })
  mimeType!: string;

  @Prop({ type: Number, required: true })
  sizeBytes!: number;

  @Prop({ type: String, required: true })
  storageKey!: string;

  @Prop({ default: false, index: true })
  isDeleted!: boolean;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export const FileSchema = SchemaFactory.createForClass(FileAsset);
// Fetch all attachments for a given entity (task/project/comment).
FileSchema.index({ orgId: 1, 'scope.type': 1, 'scope.id': 1 });
