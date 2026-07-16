import { Injectable } from '@nestjs/common';
import { ClientSession, FilterQuery, Model, Types, UpdateQuery } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Sprint, SprintDocument } from './schemas/sprint.schema';

export type SprintLean = Sprint & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export interface SprintListParams {
  orgId: string;
  projectId: string;
  status: 'planned' | 'active' | 'completed' | 'all';
  beforeId?: string;
  limit: number;
}

export abstract class SprintsRepository {
  abstract findById(orgId: string, id: string, includeDeleted?: boolean): Promise<SprintLean | null>;
  abstract create(data: Partial<Sprint>, session?: ClientSession): Promise<SprintLean>;
  abstract updateById(
    orgId: string,
    id: string,
    update: UpdateQuery<Sprint>,
    session?: ClientSession,
  ): Promise<SprintLean | null>;
  abstract softDelete(orgId: string, id: string): Promise<boolean>;
  abstract listCursor(params: SprintListParams): Promise<SprintLean[]>;
}

@Injectable()
export class MongoSprintsRepository extends SprintsRepository {
  constructor(@InjectModel(Sprint.name) private readonly model: Model<SprintDocument>) {
    super();
  }

  findById(orgId: string, id: string, includeDeleted = false): Promise<SprintLean | null> {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(orgId)) return Promise.resolve(null);
    const filter: FilterQuery<SprintDocument> = { _id: id, orgId };
    if (!includeDeleted) filter.isDeleted = { $ne: true };
    return this.model.findOne(filter).lean<SprintLean>().exec();
  }

  async create(data: Partial<Sprint>, session?: ClientSession): Promise<SprintLean> {
    const [doc] = await this.model.create([data], { session });
    return doc.toObject() as unknown as SprintLean;
  }

  updateById(
    orgId: string,
    id: string,
    update: UpdateQuery<Sprint>,
    session?: ClientSession,
  ): Promise<SprintLean | null> {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(orgId)) return Promise.resolve(null);
    return this.model
      .findOneAndUpdate({ _id: id, orgId, isDeleted: { $ne: true } }, update, { new: true, session })
      .lean<SprintLean>()
      .exec();
  }

  async softDelete(orgId: string, id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(orgId)) return false;
    const res = await this.model
      .updateOne(
        { _id: id, orgId, isDeleted: { $ne: true } },
        { $set: { isDeleted: true, deletedAt: new Date() } },
      )
      .exec();
    return res.modifiedCount > 0;
  }

  listCursor(params: SprintListParams): Promise<SprintLean[]> {
    if (!Types.ObjectId.isValid(params.orgId) || !Types.ObjectId.isValid(params.projectId)) {
      return Promise.resolve([]);
    }
    const filter: FilterQuery<SprintDocument> = {
      orgId: new Types.ObjectId(params.orgId),
      projectId: new Types.ObjectId(params.projectId),
      isDeleted: { $ne: true },
    };
    if (params.status !== 'all') filter.status = params.status;
    if (params.beforeId && Types.ObjectId.isValid(params.beforeId)) {
      filter._id = { $lt: new Types.ObjectId(params.beforeId) };
    }
    return this.model
      .find(filter)
      .sort({ _id: -1 })
      .limit(params.limit + 1)
      .lean<SprintLean[]>()
      .exec();
  }
}
