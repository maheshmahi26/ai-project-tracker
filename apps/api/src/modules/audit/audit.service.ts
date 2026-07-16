import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { AuditLogRepository } from './audit.repository';

export interface AuditInput {
  action: string;
  actorId?: string | null;
  actorType?: 'user' | 'ai' | 'system';
  orgId?: string | null;
  entity?: { type: string; id: string } | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  source?: 'ui' | 'ai' | 'system';
  requestId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

function toObjectId(id?: string | null): Types.ObjectId | null {
  return id && Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null;
}

/** Writes security/compliance audit entries. Never throws into the caller. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly repo: AuditLogRepository) {}

  async record(input: AuditInput): Promise<void> {
    try {
      await this.repo.create({
        action: input.action,
        actorId: toObjectId(input.actorId),
        actorType: input.actorType ?? 'user',
        orgId: toObjectId(input.orgId),
        entity: input.entity ?? null,
        before: input.before ?? null,
        after: input.after ?? null,
        source: input.source ?? 'ui',
        requestId: input.requestId ?? null,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      });
    } catch (error) {
      // Auditing must never break the request path.
      this.logger.error(`Failed to write audit log for ${input.action}`, error as Error);
    }
  }
}
