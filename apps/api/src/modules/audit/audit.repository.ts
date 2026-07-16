import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';

export type AuditLogLean = AuditLog & {
  _id: Types.ObjectId;
  createdAt: Date;
};

export interface AuditListFilter {
  orgId: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  /** Cursor: rows with `_id` less than this (descending by _id). */
  beforeId?: string;
  limit: number;
}

export abstract class AuditLogRepository {
  abstract create(entry: Partial<AuditLog>): Promise<void>;
  abstract list(filter: AuditListFilter): Promise<AuditLogLean[]>;
}

@Injectable()
export class MongoAuditLogRepository extends AuditLogRepository {
  constructor(@InjectModel(AuditLog.name) private readonly model: Model<AuditLogDocument>) {
    super();
  }

  async create(entry: Partial<AuditLog>): Promise<void> {
    await this.model.create(entry);
  }

  list(filter: AuditListFilter): Promise<AuditLogLean[]> {
    const query: FilterQuery<AuditLogDocument> = { orgId: new Types.ObjectId(filter.orgId) };
    if (filter.action) query.action = filter.action;
    if (filter.entityType) query['entity.type'] = filter.entityType;
    if (filter.entityId) query['entity.id'] = filter.entityId;
    if (filter.beforeId && Types.ObjectId.isValid(filter.beforeId)) {
      query._id = { $lt: new Types.ObjectId(filter.beforeId) };
    }
    return this.model
      .find(query)
      .sort({ _id: -1 })
      .limit(filter.limit + 1)
      .lean<AuditLogLean[]>()
      .exec();
  }
}
