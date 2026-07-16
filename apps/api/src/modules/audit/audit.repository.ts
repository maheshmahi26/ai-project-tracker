import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';

export abstract class AuditLogRepository {
  abstract create(entry: Partial<AuditLog>): Promise<void>;
}

@Injectable()
export class MongoAuditLogRepository extends AuditLogRepository {
  constructor(@InjectModel(AuditLog.name) private readonly model: Model<AuditLogDocument>) {
    super();
  }

  async create(entry: Partial<AuditLog>): Promise<void> {
    await this.model.create(entry);
  }
}
