import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

/**
 * Users are global (not org-scoped); org membership is modeled separately.
 * Sensitive fields (passwordHash, refreshTokenHash, resetTokenHash) are stripped
 * by the toJSON transform as defense in depth — services also map to PublicUser.
 */
@Schema({
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      delete ret.passwordHash;
      delete ret.refreshTokenHash;
      delete ret.resetTokenHash;
      delete ret.resetTokenExpiresAt;
      return ret;
    },
  },
})
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true, index: true })
  email!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ type: String, default: null })
  avatarUrl?: string | null;

  @Prop({ type: String, default: null, select: false })
  passwordHash?: string | null;

  @Prop({ type: String, required: true, enum: ['local', 'google'], default: 'local' })
  provider!: 'local' | 'google';

  @Prop({ type: String, default: null, index: { sparse: true } })
  googleId?: string | null;

  @Prop({ type: Date, default: null })
  emailVerifiedAt?: Date | null;

  @Prop({ type: String, default: null, select: false })
  refreshTokenHash?: string | null;

  @Prop({ type: String, default: null, select: false })
  resetTokenHash?: string | null;

  @Prop({ type: Date, default: null, select: false })
  resetTokenExpiresAt?: Date | null;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Organization', default: null })
  defaultOrgId?: Types.ObjectId | null;

  @Prop({ type: String, required: true, enum: ['active', 'invited', 'disabled'], default: 'active' })
  status!: 'active' | 'invited' | 'disabled';

  @Prop({ type: Boolean, default: false })
  mustChangePassword!: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
