import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { ROLES } from '@ai-projectos/shared';

export type MembershipDocument = HydratedDocument<Membership>;

/**
 * Per-org role assignment. A user can hold different roles across orgs.
 * Unique on (orgId, userId).
 */
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
export class Membership {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Organization', required: true, index: true })
  orgId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, required: true, enum: ROLES })
  role!: (typeof ROLES)[number];

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', default: null })
  invitedBy?: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  joinedAt?: Date | null;

  @Prop({ type: String, required: true, enum: ['active', 'invited'], default: 'active' })
  status!: 'active' | 'invited';
}

export const MembershipSchema = SchemaFactory.createForClass(Membership);
MembershipSchema.index({ orgId: 1, userId: 1 }, { unique: true });
