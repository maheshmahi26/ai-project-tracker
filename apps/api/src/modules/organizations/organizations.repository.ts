import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types, UpdateQuery } from 'mongoose';
import { Organization, OrganizationDocument } from './schemas/organization.schema';

export type OrgLean = Organization & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export abstract class OrganizationsRepository {
  abstract findById(id: string): Promise<OrgLean | null>;
  abstract findBySlug(slug: string): Promise<OrgLean | null>;
  abstract findByIds(ids: string[]): Promise<OrgLean[]>;
  abstract create(data: Partial<Organization>, session?: ClientSession): Promise<OrgLean>;
  abstract updateById(id: string, update: UpdateQuery<Organization>): Promise<OrgLean | null>;
  abstract softDelete(id: string): Promise<boolean>;
}

@Injectable()
export class MongoOrganizationsRepository extends OrganizationsRepository {
  constructor(
    @InjectModel(Organization.name) private readonly model: Model<OrganizationDocument>,
  ) {
    super();
  }

  findById(id: string): Promise<OrgLean | null> {
    if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
    return this.model.findOne({ _id: id, isDeleted: { $ne: true } }).lean<OrgLean>().exec();
  }

  findBySlug(slug: string): Promise<OrgLean | null> {
    return this.model
      .findOne({ slug: slug.toLowerCase(), isDeleted: { $ne: true } })
      .lean<OrgLean>()
      .exec();
  }

  findByIds(ids: string[]): Promise<OrgLean[]> {
    const valid = ids.filter((id) => Types.ObjectId.isValid(id));
    return this.model
      .find({ _id: { $in: valid }, isDeleted: { $ne: true } })
      .lean<OrgLean[]>()
      .exec();
  }

  async create(data: Partial<Organization>, session?: ClientSession): Promise<OrgLean> {
    const [doc] = await this.model.create([data], { session });
    return doc.toObject() as unknown as OrgLean;
  }

  updateById(id: string, update: UpdateQuery<Organization>): Promise<OrgLean | null> {
    if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
    return this.model
      .findOneAndUpdate({ _id: id, isDeleted: { $ne: true } }, update, { new: true })
      .lean<OrgLean>()
      .exec();
  }

  async softDelete(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const res = await this.model
      .updateOne({ _id: id }, { $set: { isDeleted: true, deletedAt: new Date() } })
      .exec();
    return res.modifiedCount > 0;
  }
}
