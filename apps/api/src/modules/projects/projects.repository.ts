import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, FilterQuery, Model, SortOrder, Types, UpdateQuery } from 'mongoose';
import { Project, ProjectDocument } from './schemas/project.schema';

export type ProjectLean = Project & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export interface ProjectListParams {
  orgId: string;
  status: 'active' | 'archived' | 'all';
  q?: string;
  /** Cursor mode: rows with `_id` less than this (descending). */
  beforeId?: string;
  /** Offset mode. */
  skip?: number;
  sort?: Record<string, SortOrder>;
  limit: number;
}

export abstract class ProjectsRepository {
  abstract findById(orgId: string, id: string, includeDeleted?: boolean): Promise<ProjectLean | null>;
  abstract findByKey(orgId: string, key: string): Promise<ProjectLean | null>;
  /** Active (non-deleted) project this user currently leads, if any. */
  abstract findByLead(orgId: string, leadId: string): Promise<ProjectLean | null>;
  abstract create(data: Partial<Project>, session?: ClientSession): Promise<ProjectLean>;
  abstract updateById(
    orgId: string,
    id: string,
    update: UpdateQuery<Project>,
    includeDeleted?: boolean,
  ): Promise<ProjectLean | null>;
  abstract softDelete(orgId: string, id: string): Promise<boolean>;
  abstract restoreDeleted(orgId: string, id: string): Promise<boolean>;
  abstract listCursor(params: ProjectListParams): Promise<ProjectLean[]>;
  abstract listOffset(params: ProjectListParams): Promise<{ rows: ProjectLean[]; total: number }>;
  /** Atomically bump and return the per-project task sequence (for `KEY-123`). */
  abstract nextTaskSeq(orgId: string, id: string): Promise<number | null>;
}

@Injectable()
export class MongoProjectsRepository extends ProjectsRepository {
  constructor(@InjectModel(Project.name) private readonly model: Model<ProjectDocument>) {
    super();
  }

  findById(orgId: string, id: string, includeDeleted = false): Promise<ProjectLean | null> {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(orgId)) return Promise.resolve(null);
    const filter: FilterQuery<ProjectDocument> = { _id: id, orgId };
    if (!includeDeleted) filter.isDeleted = { $ne: true };
    return this.model.findOne(filter).lean<ProjectLean>().exec();
  }

  findByKey(orgId: string, key: string): Promise<ProjectLean | null> {
    if (!Types.ObjectId.isValid(orgId)) return Promise.resolve(null);
    return this.model
      .findOne({ orgId, key: key.toUpperCase(), isDeleted: { $ne: true } })
      .lean<ProjectLean>()
      .exec();
  }

  findByLead(orgId: string, leadId: string): Promise<ProjectLean | null> {
    if (!Types.ObjectId.isValid(orgId) || !Types.ObjectId.isValid(leadId)) {
      return Promise.resolve(null);
    }
    return this.model
      .findOne({ orgId, leadId, isDeleted: { $ne: true } })
      .lean<ProjectLean>()
      .exec();
  }

  async create(data: Partial<Project>, session?: ClientSession): Promise<ProjectLean> {
    const [doc] = await this.model.create([data], { session });
    return doc.toObject() as unknown as ProjectLean;
  }

  updateById(
    orgId: string,
    id: string,
    update: UpdateQuery<Project>,
    includeDeleted = false,
  ): Promise<ProjectLean | null> {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(orgId)) return Promise.resolve(null);
    const filter: FilterQuery<ProjectDocument> = { _id: id, orgId };
    if (!includeDeleted) filter.isDeleted = { $ne: true };
    return this.model.findOneAndUpdate(filter, update, { new: true }).lean<ProjectLean>().exec();
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

  async restoreDeleted(orgId: string, id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(orgId)) return false;
    const res = await this.model
      .updateOne({ _id: id, orgId, isDeleted: true }, { $set: { isDeleted: false, deletedAt: null } })
      .exec();
    return res.modifiedCount > 0;
  }

  listCursor(params: ProjectListParams): Promise<ProjectLean[]> {
    const filter = this.baseFilter(params);
    if (params.beforeId && Types.ObjectId.isValid(params.beforeId)) {
      filter._id = { $lt: new Types.ObjectId(params.beforeId) };
    }
    return this.model
      .find(filter)
      .sort({ _id: -1 })
      .limit(params.limit + 1)
      .lean<ProjectLean[]>()
      .exec();
  }

  async listOffset(params: ProjectListParams): Promise<{ rows: ProjectLean[]; total: number }> {
    const filter = this.baseFilter(params);
    const sort: Record<string, SortOrder | { $meta: 'textScore' }> = params.q
      ? { score: { $meta: 'textScore' }, _id: -1 }
      : (params.sort ?? { createdAt: -1, _id: -1 });

    const query = this.model.find(filter);
    if (params.q) query.select({ score: { $meta: 'textScore' } });

    const [rows, total] = await Promise.all([
      query
        .sort(sort as Record<string, SortOrder>)
        .skip(params.skip ?? 0)
        .limit(params.limit)
        .lean<ProjectLean[]>()
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return { rows, total };
  }

  async nextTaskSeq(orgId: string, id: string): Promise<number | null> {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(orgId)) return null;
    const doc = await this.model
      .findOneAndUpdate(
        { _id: id, orgId, isDeleted: { $ne: true } },
        { $inc: { 'counters.taskSeq': 1 } },
        { new: true },
      )
      .lean<ProjectLean>()
      .exec();
    return doc ? doc.counters.taskSeq : null;
  }

  private baseFilter(params: ProjectListParams): FilterQuery<ProjectDocument> {
    const filter: FilterQuery<ProjectDocument> = {
      orgId: new Types.ObjectId(params.orgId),
      isDeleted: { $ne: true },
    };
    if (params.status !== 'all') filter.status = params.status;
    if (params.q) filter.$text = { $search: params.q };
    return filter;
  }
}
