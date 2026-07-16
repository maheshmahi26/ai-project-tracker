import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Role } from '@ai-projectos/shared';
import { Membership, MembershipDocument } from './schemas/membership.schema';

export type MembershipLean = Membership & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export abstract class MembershipsRepository {
  abstract findActive(orgId: string, userId: string): Promise<MembershipLean | null>;
  abstract listByUser(userId: string): Promise<MembershipLean[]>;
  abstract listByOrg(orgId: string): Promise<MembershipLean[]>;
  abstract create(data: Partial<Membership>, session?: ClientSession): Promise<MembershipLean>;
  abstract updateRole(orgId: string, userId: string, role: Role): Promise<MembershipLean | null>;
  abstract remove(orgId: string, userId: string): Promise<boolean>;
  abstract countByOrgAndRole(orgId: string, role: Role): Promise<number>;
}

@Injectable()
export class MongoMembershipsRepository extends MembershipsRepository {
  constructor(@InjectModel(Membership.name) private readonly model: Model<MembershipDocument>) {
    super();
  }

  findActive(orgId: string, userId: string): Promise<MembershipLean | null> {
    if (!Types.ObjectId.isValid(orgId) || !Types.ObjectId.isValid(userId)) {
      return Promise.resolve(null);
    }
    return this.model.findOne({ orgId, userId, status: 'active' }).lean<MembershipLean>().exec();
  }

  listByUser(userId: string): Promise<MembershipLean[]> {
    if (!Types.ObjectId.isValid(userId)) return Promise.resolve([]);
    return this.model.find({ userId, status: 'active' }).lean<MembershipLean[]>().exec();
  }

  listByOrg(orgId: string): Promise<MembershipLean[]> {
    if (!Types.ObjectId.isValid(orgId)) return Promise.resolve([]);
    return this.model.find({ orgId }).lean<MembershipLean[]>().exec();
  }

  async create(data: Partial<Membership>, session?: ClientSession): Promise<MembershipLean> {
    const [doc] = await this.model.create([data], { session });
    return doc.toObject() as unknown as MembershipLean;
  }

  updateRole(orgId: string, userId: string, role: Role): Promise<MembershipLean | null> {
    return this.model
      .findOneAndUpdate({ orgId, userId }, { $set: { role } }, { new: true })
      .lean<MembershipLean>()
      .exec();
  }

  async remove(orgId: string, userId: string): Promise<boolean> {
    const res = await this.model.deleteOne({ orgId, userId }).exec();
    return res.deletedCount > 0;
  }

  countByOrgAndRole(orgId: string, role: Role): Promise<number> {
    return this.model.countDocuments({ orgId, role, status: 'active' }).exec();
  }
}
