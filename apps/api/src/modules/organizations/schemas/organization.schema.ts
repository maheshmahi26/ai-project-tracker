import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type OrganizationDocument = HydratedDocument<Organization>;

@Schema({ _id: false })
export class OrgSettings {
  @Prop({ default: 'UTC' })
  timezone!: string;

  @Prop({ type: Object, default: {} })
  features!: Record<string, boolean>;
}
const OrgSettingsSchema = SchemaFactory.createForClass(OrgSettings);

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
export class Organization {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true, index: true })
  slug!: string;

  @Prop({ type: String, default: null })
  logoUrl?: string | null;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true, index: true })
  ownerId!: Types.ObjectId;

  @Prop({ type: String, required: true, enum: ['free', 'pro'], default: 'free' })
  plan!: 'free' | 'pro';

  @Prop({ type: OrgSettingsSchema, default: () => ({ timezone: 'UTC', features: {} }) })
  settings!: OrgSettings;

  @Prop({ default: false, index: true })
  isDeleted!: boolean;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export const OrganizationSchema = SchemaFactory.createForClass(Organization);
