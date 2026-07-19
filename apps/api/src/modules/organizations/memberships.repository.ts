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
  abstract findByOrgAndUser(orgId: string, userId: string): Promise<MembershipLean | null>;
  abstract listByUser(userId: string): Promise<MembershipLean[]>;
  abstract listByOrg(orgId: string): Promise<MembershipLean[]>;
  abstract listByOrgPaged(orgId: string, skip: number, limit: number): Promise<MembershipLean[]>;
  abstract countByOrg(orgId: string): Promise<number>;
  abstract create(data: Partial<Membership>, session?: ClientSession): Promise<MembershipLean>;
  abstract updateRole(orgId: string, userId: string, role: Role): Promise<MembershipLean | null>;
  abstract remove(orgId: string, userId: string): Promise<boolean>;
  abstract countByOrgAndRole(orgId: string, role: Role): Promise<number>;
  /** Count of active members grouped by role (for dashboard team stats). */
  abstract countActiveByRole(orgId: string): Promise<Array<{ role: Role; count: number }>>;
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

  findByOrgAndUser(orgId: string, userId: string): Promise<MembershipLean | null> {
    if (!Types.ObjectId.isValid(orgId) || !Types.ObjectId.isValid(userId)) {
      return Promise.resolve(null);
    }
    return this.model.findOne({ orgId, userId }).lean<MembershipLean>().exec();
  }

  listByUser(userId: string): Promise<MembershipLean[]> {
    if (!Types.ObjectId.isValid(userId)) return Promise.resolve([]);
    return this.model.find({ userId, status: 'active' }).lean<MembershipLean[]>().exec();
  }

  listByOrg(orgId: string): Promise<MembershipLean[]> {
    if (!Types.ObjectId.isValid(orgId)) return Promise.resolve([]);
    return this.model.find({ orgId }).lean<MembershipLean[]>().exec();
  }

  listByOrgPaged(orgId: string, skip: number, limit: number): Promise<MembershipLean[]> {
    if (!Types.ObjectId.isValid(orgId)) return Promise.resolve([]);
    return this.model
      .find({ orgId })
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean<MembershipLean[]>()
      .exec();
  }

  countByOrg(orgId: string): Promise<number> {
    if (!Types.ObjectId.isValid(orgId)) return Promise.resolve(0);
    return this.model.countDocuments({ orgId }).exec();
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

  async countActiveByRole(orgId: string): Promise<Array<{ role: Role; count: number }>> {
    if (!Types.ObjectId.isValid(orgId)) return [];
    const rows = await this.model
      .aggregate<{ _id: Role; count: number }>([
        { $match: { orgId: new Types.ObjectId(orgId), status: 'active' } },
        { $group: { _id: '$role', count: { $sum: 1 } } },
      ])
      .exec();
    return rows.map((r) => ({ role: r._id, count: r.count }));
  }
}
