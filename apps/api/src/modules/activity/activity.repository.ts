import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { ActivityLog, ActivityLogDocument } from './schemas/activity-log.schema';

export type ActivityLogLean = ActivityLog & {
  _id: Types.ObjectId;
  createdAt: Date;
};

export interface ActivityListFilter {
  orgId: string;
  projectId?: string;
  entityType?: string;
  entityId?: string;
  /** Fetch rows with `_id` less than this (cursor, descending by _id). */
  beforeId?: string;
  limit: number;
}

export abstract class ActivityLogRepository {
  abstract create(entry: Partial<ActivityLog>): Promise<void>;
  abstract list(filter: ActivityListFilter): Promise<ActivityLogLean[]>;
}

@Injectable()
export class MongoActivityLogRepository extends ActivityLogRepository {
  constructor(@InjectModel(ActivityLog.name) private readonly model: Model<ActivityLogDocument>) {
    super();
  }

  async create(entry: Partial<ActivityLog>): Promise<void> {
    await this.model.create(entry);
  }

  list(filter: ActivityListFilter): Promise<ActivityLogLean[]> {
    const query: FilterQuery<ActivityLogDocument> = { orgId: new Types.ObjectId(filter.orgId) };
    if (filter.projectId && Types.ObjectId.isValid(filter.projectId)) {
      query.projectId = new Types.ObjectId(filter.projectId);
    }
    if (filter.entityType) query['object.type'] = filter.entityType;
    if (filter.entityId) query['object.id'] = filter.entityId;
    if (filter.beforeId && Types.ObjectId.isValid(filter.beforeId)) {
      query._id = { $lt: new Types.ObjectId(filter.beforeId) };
    }
    return this.model
      .find(query)
      .sort({ _id: -1 })
      .limit(filter.limit + 1)
      .lean<ActivityLogLean[]>()
      .exec();
  }
}
