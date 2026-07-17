import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, FilterQuery, Model, SortOrder, Types, UpdateQuery } from 'mongoose';
import { Task, TaskDocument } from './schemas/task.schema';

export type TaskLean = Task & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export interface TaskListParams {
  orgId: string;
  projectId?: string;
  sprintId?: string;
  status?: string[];
  priority?: string[];
  assigneeId?: string;
  /** Specific parent id, or `null` for top-level tasks only, or undefined for any. */
  parentId?: string | null;
  q?: string;
  sort?: Record<string, SortOrder>;
  beforeId?: string;
  limit: number;
}

export interface SprintPointTotals {
  committed: number;
  completed: number;
}

export abstract class TasksRepository {
  abstract findById(orgId: string, id: string, includeDeleted?: boolean): Promise<TaskLean | null>;
  abstract findByKey(orgId: string, key: string): Promise<TaskLean | null>;
  abstract findByIds(orgId: string, ids: string[]): Promise<TaskLean[]>;
  abstract create(data: Partial<Task>, session?: ClientSession): Promise<TaskLean>;
  abstract updateById(
    orgId: string,
    id: string,
    update: UpdateQuery<Task>,
    session?: ClientSession,
  ): Promise<TaskLean | null>;
  abstract updateMany(
    orgId: string,
    ids: string[],
    update: UpdateQuery<Task>,
    session?: ClientSession,
  ): Promise<number>;
  abstract softDelete(orgId: string, id: string, session?: ClientSession): Promise<boolean>;
  abstract restoreDeleted(orgId: string, id: string): Promise<boolean>;
  abstract detachSprint(orgId: string, sprintId: string, session?: ClientSession): Promise<void>;
  abstract pullLabel(orgId: string, labelId: string): Promise<void>;
  abstract listCursor(params: TaskListParams): Promise<TaskLean[]>;
  abstract maxOrder(orgId: string, projectId: string, status: string): Promise<number>;
  abstract sumPointsBySprint(
    orgId: string,
    sprintId: string,
    session?: ClientSession,
  ): Promise<SprintPointTotals>;
}

@Injectable()
export class MongoTasksRepository extends TasksRepository {
  constructor(@InjectModel(Task.name) private readonly model: Model<TaskDocument>) {
    super();
  }

  findById(orgId: string, id: string, includeDeleted = false): Promise<TaskLean | null> {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(orgId)) return Promise.resolve(null);
    const filter: FilterQuery<TaskDocument> = { _id: id, orgId };
    if (!includeDeleted) filter.isDeleted = { $ne: true };
    return this.model.findOne(filter).lean<TaskLean>().exec();
  }

  findByKey(orgId: string, key: string): Promise<TaskLean | null> {
    if (!Types.ObjectId.isValid(orgId)) return Promise.resolve(null);
    return this.model
      .findOne({ orgId: new Types.ObjectId(orgId), key: key.toUpperCase(), isDeleted: { $ne: true } })
      .lean<TaskLean>()
      .exec();
  }

  findByIds(orgId: string, ids: string[]): Promise<TaskLean[]> {
    if (!Types.ObjectId.isValid(orgId)) return Promise.resolve([]);
    const valid = ids.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
    return this.model
      .find({ orgId: new Types.ObjectId(orgId), _id: { $in: valid }, isDeleted: { $ne: true } })
      .lean<TaskLean[]>()
      .exec();
  }

  async create(data: Partial<Task>, session?: ClientSession): Promise<TaskLean> {
    const [doc] = await this.model.create([data], { session });
    return doc.toObject() as unknown as TaskLean;
  }

  updateById(
    orgId: string,
    id: string,
    update: UpdateQuery<Task>,
    session?: ClientSession,
  ): Promise<TaskLean | null> {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(orgId)) return Promise.resolve(null);
    return this.model
      .findOneAndUpdate({ _id: id, orgId, isDeleted: { $ne: true } }, update, { new: true, session })
      .lean<TaskLean>()
      .exec();
  }

  async updateMany(
    orgId: string,
    ids: string[],
    update: UpdateQuery<Task>,
    session?: ClientSession,
  ): Promise<number> {
    if (!Types.ObjectId.isValid(orgId)) return 0;
    const valid = ids.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
    const res = await this.model
      .updateMany(
        { orgId: new Types.ObjectId(orgId), _id: { $in: valid }, isDeleted: { $ne: true } },
        update,
        { session },
      )
      .exec();
    return res.modifiedCount;
  }

  async softDelete(orgId: string, id: string, session?: ClientSession): Promise<boolean> {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(orgId)) return false;
    const res = await this.model
      .updateOne(
        { _id: id, orgId, isDeleted: { $ne: true } },
        { $set: { isDeleted: true, deletedAt: new Date() } },
        { session },
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

  async detachSprint(orgId: string, sprintId: string, session?: ClientSession): Promise<void> {
    if (!Types.ObjectId.isValid(orgId) || !Types.ObjectId.isValid(sprintId)) return;
    await this.model
      .updateMany(
        { orgId: new Types.ObjectId(orgId), sprintId: new Types.ObjectId(sprintId) },
        { $set: { sprintId: null } },
        { session },
      )
      .exec();
  }

  async pullLabel(orgId: string, labelId: string): Promise<void> {
    if (!Types.ObjectId.isValid(orgId) || !Types.ObjectId.isValid(labelId)) return;
    await this.model
      .updateMany(
        { orgId: new Types.ObjectId(orgId), labelIds: new Types.ObjectId(labelId) },
        { $pull: { labelIds: new Types.ObjectId(labelId) } },
      )
      .exec();
  }

  listCursor(params: TaskListParams): Promise<TaskLean[]> {
    const filter = this.baseFilter(params);
    // Cursor predicate must be part of the filter BEFORE the query is built.
    if (!params.q && params.beforeId && Types.ObjectId.isValid(params.beforeId)) {
      filter._id = { $lt: new Types.ObjectId(params.beforeId) };
    }

    const query = this.model.find(filter);
    if (params.q) {
      // Ranked full-text search: score-ordered first page (no _id cursor).
      const textSort: Record<string, SortOrder | { $meta: 'textScore' }> = {
        score: { $meta: 'textScore' },
        _id: -1,
      };
      query.select({ score: { $meta: 'textScore' } });
      query.sort(textSort as Record<string, SortOrder>);
    } else {
      query.sort(params.sort ? { ...params.sort, _id: -1 } : { _id: -1 });
    }

    return query
      .limit(params.limit + 1)
      .lean<TaskLean[]>()
      .exec();
  }

  async maxOrder(orgId: string, projectId: string, status: string): Promise<number> {
    if (!Types.ObjectId.isValid(orgId) || !Types.ObjectId.isValid(projectId)) return 0;
    const top = await this.model
      .findOne({
        orgId: new Types.ObjectId(orgId),
        projectId: new Types.ObjectId(projectId),
        status,
        isDeleted: { $ne: true },
      })
      .sort({ order: -1 })
      .select({ order: 1 })
      .lean<{ order: number }>()
      .exec();
    return top?.order ?? 0;
  }

  async sumPointsBySprint(
    orgId: string,
    sprintId: string,
    session?: ClientSession,
  ): Promise<SprintPointTotals> {
    if (!Types.ObjectId.isValid(orgId) || !Types.ObjectId.isValid(sprintId)) {
      return { committed: 0, completed: 0 };
    }
    const rows = await this.model
      .aggregate<{ committed: number; completed: number }>([
        {
          $match: {
            orgId: new Types.ObjectId(orgId),
            sprintId: new Types.ObjectId(sprintId),
            isDeleted: { $ne: true },
          },
        },
        {
          $group: {
            _id: null,
            committed: { $sum: { $ifNull: ['$storyPoints', 0] } },
            completed: {
              $sum: {
                $cond: [{ $eq: ['$status', 'done'] }, { $ifNull: ['$storyPoints', 0] }, 0],
              },
            },
          },
        },
      ])
      .session(session ?? null)
      .exec();
    return rows[0] ? { committed: rows[0].committed, completed: rows[0].completed } : { committed: 0, completed: 0 };
  }

  private baseFilter(params: TaskListParams): FilterQuery<TaskDocument> {
    const filter: FilterQuery<TaskDocument> = {
      orgId: new Types.ObjectId(params.orgId),
      isDeleted: { $ne: true },
    };
    if (params.projectId && Types.ObjectId.isValid(params.projectId)) {
      filter.projectId = new Types.ObjectId(params.projectId);
    }
    if (params.sprintId && Types.ObjectId.isValid(params.sprintId)) {
      filter.sprintId = new Types.ObjectId(params.sprintId);
    }
    if (params.status && params.status.length > 0) filter.status = { $in: params.status };
    if (params.priority && params.priority.length > 0) filter.priority = { $in: params.priority };
    if (params.assigneeId && Types.ObjectId.isValid(params.assigneeId)) {
      filter.assigneeId = new Types.ObjectId(params.assigneeId);
    }
    if (params.parentId === null) {
      filter.parentId = null;
    } else if (params.parentId && Types.ObjectId.isValid(params.parentId)) {
      filter.parentId = new Types.ObjectId(params.parentId);
    }
    if (params.q) filter.$text = { $search: params.q };
    return filter;
  }
}
