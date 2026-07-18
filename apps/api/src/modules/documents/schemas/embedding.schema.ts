import { Prop, raw, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type EmbeddingDocument = HydratedDocument<Embedding>;

/**
 * Chunk metadata + text. The float vector itself lives in Qdrant (point id =
 * `qdrantPointId`); Mongo keeps the human-readable text so we can render
 * citations after Qdrant returns matching point ids.
 */
@Schema({
  collection: 'embeddings',
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
export class Embedding {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Organization', required: true, index: true })
  orgId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'DocEntity', required: true })
  documentId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Project', default: null })
  projectId?: Types.ObjectId | null;

  @Prop({ type: Number, required: true })
  chunkIndex!: number;

  @Prop({ type: String, required: true })
  text!: string;

  @Prop({ type: String, required: true, index: true })
  qdrantPointId!: string;

  @Prop(
    raw({
      _id: false,
      tokens: { type: Number, default: 0 },
      page: { type: Number, default: null },
      heading: { type: String, default: null },
    }),
  )
  metadata!: { tokens: number; page?: number | null; heading?: string | null };
}

export const EmbeddingSchema = SchemaFactory.createForClass(Embedding);
EmbeddingSchema.index({ orgId: 1, documentId: 1, chunkIndex: 1 });
