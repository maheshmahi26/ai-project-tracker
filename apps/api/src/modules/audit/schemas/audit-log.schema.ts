import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type AuditLogDocument = HydratedDocument<AuditLog>;

/**
 * Immutable, compliance-grade record of security-relevant events and mutations.
 * `orgId` is optional because some auth events (login, refresh reuse) have no
 * org context. See specs/03-database-schema.md (#10).
 */
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class AuditLog {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Organization', default: null, index: true })
  orgId?: Types.ObjectId | null;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', default: null })
  actorId?: Types.ObjectId | null;

  @Prop({ type: String, required: true, enum: ['user', 'ai', 'system'], default: 'user' })
  actorType!: 'user' | 'ai' | 'system';

  @Prop({ type: String, required: true, index: true })
  action!: string;

  @Prop({ type: Object, default: null })
  entity?: { type: string; id: string } | null;

  @Prop({ type: Object, default: null })
  before?: Record<string, unknown> | null;

  @Prop({ type: Object, default: null })
  after?: Record<string, unknown> | null;

  @Prop({ type: String, required: true, enum: ['ui', 'ai', 'system'], default: 'ui' })
  source!: 'ui' | 'ai' | 'system';

  @Prop({ type: String, default: null })
  requestId?: string | null;

  @Prop({ type: String, default: null })
  ip?: string | null;

  @Prop({ type: String, default: null })
  userAgent?: string | null;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ orgId: 1, createdAt: -1 });
