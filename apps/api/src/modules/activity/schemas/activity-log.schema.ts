import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type ActivityLogDocument = HydratedDocument<ActivityLog>;

/**
 * Denormalized, presentation-friendly timeline feed. Written from the same
 * domain events as AuditLogs but optimized for rendering (verb + labeled object).
 * See specs/03-database-schema.md (#11).
 */
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class ActivityLog {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Organization', required: true, index: true })
  orgId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', default: null })
  actorId?: Types.ObjectId | null;

  @Prop({ type: String, required: true })
  verb!: string;

  @Prop({ type: Object, required: true })
  object!: { type: string; id: string; label: string };

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Project', default: null, index: true })
  projectId?: Types.ObjectId | null;
}

export const ActivityLogSchema = SchemaFactory.createForClass(ActivityLog);
ActivityLogSchema.index({ orgId: 1, projectId: 1, createdAt: -1 });
ActivityLogSchema.index({ orgId: 1, createdAt: -1 });
