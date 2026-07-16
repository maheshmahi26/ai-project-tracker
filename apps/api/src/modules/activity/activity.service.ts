import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import type { ActivityLogDTO, ListActivityQuery } from '@ai-projectos/shared';
import { buildCursorPage, decodeCursor, PaginatedResult } from '../../common/pagination/pagination';
import {
  ActivityLogRepository,
  type ActivityLogLean,
} from './activity.repository';

export interface RecordActivityInput {
  orgId: string;
  actorId?: string | null;
  verb: string;
  object: { type: string; id: string; label: string };
  projectId?: string | null;
}

/** Writes + reads the human-friendly activity timeline. Never throws on write. */
@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(private readonly repo: ActivityLogRepository) {}

  async record(input: RecordActivityInput): Promise<void> {
    try {
      await this.repo.create({
        orgId: new Types.ObjectId(input.orgId),
        actorId: toObjectId(input.actorId),
        verb: input.verb,
        object: input.object,
        projectId: toObjectId(input.projectId),
      });
    } catch (error) {
      this.logger.error(`Failed to write activity (${input.verb})`, error as Error);
    }
  }

  async list(orgId: string, query: ListActivityQuery): Promise<PaginatedResult<ActivityLogDTO>> {
    const rows = await this.repo.list({
      orgId,
      projectId: query.projectId,
      entityType: query.entityType,
      entityId: query.entityId,
      beforeId: decodeCursor(query.cursor) ?? undefined,
      limit: query.limit,
    });
    return buildCursorPage(rows.map(toActivityDTO), query.limit, (item) => item.id);
  }
}

function toObjectId(id?: string | null): Types.ObjectId | null {
  return id && Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null;
}

function toActivityDTO(row: ActivityLogLean): ActivityLogDTO {
  return {
    id: row._id.toString(),
    orgId: row.orgId.toString(),
    actorId: row.actorId ? row.actorId.toString() : null,
    verb: row.verb,
    object: row.object,
    projectId: row.projectId ? row.projectId.toString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
