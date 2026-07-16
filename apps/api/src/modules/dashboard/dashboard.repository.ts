import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { Task } from '../tasks/schemas/task.schema';
import { Sprint } from '../sprints/schemas/sprint.schema';
import { Project } from '../projects/schemas/project.schema';

export interface StatusCountRow {
  _id: string;
  count: number;
  points?: number;
}

export interface SprintStatusRow {
  _id: string;
  count: number;
  committed: number;
  completed: number;
}

export interface PerUserRow {
  _id: Types.ObjectId | null;
  total: number;
  done: number;
  points: number;
}

export interface ProjectRollupRow {
  _id: Types.ObjectId;
  total: number;
  done: number;
  points: number;
  donePoints: number;
}

export interface ContributorRow {
  _id: Types.ObjectId;
  done: number;
}

export interface SprintLean {
  _id: Types.ObjectId;
  name: string;
  status: 'planned' | 'active' | 'completed';
  committedPoints: number;
  completedPoints: number;
  startDate?: Date | null;
  endDate?: Date | null;
  createdAt?: Date;
}

export interface ProjectLean {
  _id: Types.ObjectId;
  key: string;
  name: string;
  status: string;
}

export interface DoneTaskLean {
  storyPoints?: number | null;
  updatedAt: Date;
}

/**
 * Read-model aggregations for the dashboard. Every pipeline `$match`es on
 * `orgId` first (indexed) so no query scans the whole collection. All results
 * are chart-ready and consumed behind the Redis cache in the service.
 */
@Injectable()
export class DashboardRepository {
  constructor(
    @InjectModel(Task.name) private readonly taskModel: Model<Task>,
    @InjectModel(Sprint.name) private readonly sprintModel: Model<Sprint>,
    @InjectModel(Project.name) private readonly projectModel: Model<Project>,
  ) {}

  private taskMatch(orgId: string, projectId?: string): FilterQuery<Task> {
    const m: FilterQuery<Task> = {
      orgId: new Types.ObjectId(orgId),
      isDeleted: { $ne: true },
    };
    if (projectId) m.projectId = new Types.ObjectId(projectId);
    return m;
  }

  private sprintMatch(orgId: string, projectId?: string): FilterQuery<Sprint> {
    const m: FilterQuery<Sprint> = {
      orgId: new Types.ObjectId(orgId),
      isDeleted: { $ne: true },
    };
    if (projectId) m.projectId = new Types.ObjectId(projectId);
    return m;
  }

  tasksByStatus(orgId: string, projectId?: string): Promise<StatusCountRow[]> {
    return this.taskModel
      .aggregate<StatusCountRow>([
        { $match: this.taskMatch(orgId, projectId) },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            points: { $sum: { $ifNull: ['$storyPoints', 0] } },
          },
        },
      ])
      .exec();
  }

  countOverdueTasks(orgId: string, now: Date, projectId?: string): Promise<number> {
    return this.taskModel
      .countDocuments({
        ...this.taskMatch(orgId, projectId),
        status: { $ne: 'done' },
        dueDate: { $ne: null, $lt: now },
      })
      .exec();
  }

  projectsByStatus(orgId: string): Promise<StatusCountRow[]> {
    return this.projectModel
      .aggregate<StatusCountRow>([
        { $match: { orgId: new Types.ObjectId(orgId), isDeleted: { $ne: true } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ])
      .exec();
  }

  sprintsByStatus(orgId: string, projectId?: string): Promise<SprintStatusRow[]> {
    return this.sprintModel
      .aggregate<SprintStatusRow>([
        { $match: this.sprintMatch(orgId, projectId) },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            committed: { $sum: { $ifNull: ['$committedPoints', 0] } },
            completed: { $sum: { $ifNull: ['$completedPoints', 0] } },
          },
        },
      ])
      .exec();
  }

  listSprintsForVelocity(orgId: string, projectId?: string, limit = 20): Promise<SprintLean[]> {
    return this.sprintModel
      .find(this.sprintMatch(orgId, projectId))
      .sort({ startDate: 1, createdAt: 1 })
      .limit(limit)
      .lean<SprintLean[]>()
      .exec();
  }

  findSprint(orgId: string, sprintId: string): Promise<SprintLean | null> {
    if (!Types.ObjectId.isValid(sprintId)) return Promise.resolve(null);
    return this.sprintModel
      .findOne({
        _id: new Types.ObjectId(sprintId),
        orgId: new Types.ObjectId(orgId),
        isDeleted: { $ne: true },
      })
      .lean<SprintLean>()
      .exec();
  }

  doneTasksInSprint(orgId: string, sprintId: string): Promise<DoneTaskLean[]> {
    return this.taskModel
      .find({
        orgId: new Types.ObjectId(orgId),
        sprintId: new Types.ObjectId(sprintId),
        isDeleted: { $ne: true },
        status: 'done',
      })
      .select('storyPoints updatedAt')
      .lean<DoneTaskLean[]>()
      .exec();
  }

  sumPointsInSprint(orgId: string, sprintId: string): Promise<number> {
    return this.taskModel
      .aggregate<{ _id: null; points: number }>([
        {
          $match: {
            orgId: new Types.ObjectId(orgId),
            sprintId: new Types.ObjectId(sprintId),
            isDeleted: { $ne: true },
          },
        },
        { $group: { _id: null, points: { $sum: { $ifNull: ['$storyPoints', 0] } } } },
      ])
      .exec()
      .then((rows) => rows[0]?.points ?? 0);
  }

  tasksPerUser(orgId: string, projectId?: string): Promise<PerUserRow[]> {
    return this.taskModel
      .aggregate<PerUserRow>([
        { $match: this.taskMatch(orgId, projectId) },
        {
          $group: {
            _id: '$assigneeId',
            total: { $sum: 1 },
            done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
            points: { $sum: { $ifNull: ['$storyPoints', 0] } },
          },
        },
        { $sort: { total: -1 } },
      ])
      .exec();
  }

  priorityDistribution(orgId: string, projectId?: string): Promise<StatusCountRow[]> {
    return this.taskModel
      .aggregate<StatusCountRow>([
        { $match: this.taskMatch(orgId, projectId) },
        { $group: { _id: '$priority', count: { $sum: 1 } } },
      ])
      .exec();
  }

  projectRollups(orgId: string): Promise<ProjectRollupRow[]> {
    return this.taskModel
      .aggregate<ProjectRollupRow>([
        { $match: this.taskMatch(orgId) },
        {
          $group: {
            _id: '$projectId',
            total: { $sum: 1 },
            done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
            points: { $sum: { $ifNull: ['$storyPoints', 0] } },
            donePoints: {
              $sum: {
                $cond: [{ $eq: ['$status', 'done'] }, { $ifNull: ['$storyPoints', 0] }, 0],
              },
            },
          },
        },
      ])
      .exec();
  }

  listActiveProjects(orgId: string): Promise<ProjectLean[]> {
    return this.projectModel
      .find({ orgId: new Types.ObjectId(orgId), isDeleted: { $ne: true } })
      .select('key name status')
      .sort({ name: 1 })
      .lean<ProjectLean[]>()
      .exec();
  }

  countTasksCreatedBetween(
    orgId: string,
    start: Date,
    end: Date,
    projectId?: string,
  ): Promise<number> {
    return this.taskModel
      .countDocuments({ ...this.taskMatch(orgId, projectId), createdAt: { $gte: start, $lte: end } })
      .exec();
  }

  createdByPriorityBetween(
    orgId: string,
    start: Date,
    end: Date,
    projectId?: string,
  ): Promise<StatusCountRow[]> {
    return this.taskModel
      .aggregate<StatusCountRow>([
        { $match: { ...this.taskMatch(orgId, projectId), createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: '$priority', count: { $sum: 1 } } },
      ])
      .exec();
  }

  /** Tasks marked done within the range (uses `updatedAt` as a completion proxy). */
  countCompletedBetween(
    orgId: string,
    start: Date,
    end: Date,
    projectId?: string,
  ): Promise<number> {
    return this.taskModel
      .countDocuments({
        ...this.taskMatch(orgId, projectId),
        status: 'done',
        updatedAt: { $gte: start, $lte: end },
      })
      .exec();
  }

  topContributorsBetween(
    orgId: string,
    start: Date,
    end: Date,
    projectId?: string,
    limit = 5,
  ): Promise<ContributorRow[]> {
    return this.taskModel
      .aggregate<ContributorRow>([
        {
          $match: {
            ...this.taskMatch(orgId, projectId),
            status: 'done',
            assigneeId: { $ne: null },
            updatedAt: { $gte: start, $lte: end },
          },
        },
        { $group: { _id: '$assigneeId', done: { $sum: 1 } } },
        { $sort: { done: -1 } },
        { $limit: limit },
      ])
      .exec();
  }

  countActiveSprints(orgId: string, projectId?: string): Promise<number> {
    return this.sprintModel
      .countDocuments({ ...this.sprintMatch(orgId, projectId), status: 'active' })
      .exec();
  }

  exportTasks(
    orgId: string,
    filter: { projectId?: string; sprintId?: string; status?: string },
  ): Promise<
    Array<{
      key: string;
      title: string;
      status: string;
      priority: string;
      storyPoints?: number | null;
      dueDate?: Date | null;
      assigneeId?: Types.ObjectId | null;
      createdAt: Date;
    }>
  > {
    const match: FilterQuery<Task> = this.taskMatch(orgId, filter.projectId);
    if (filter.sprintId && Types.ObjectId.isValid(filter.sprintId)) {
      match.sprintId = new Types.ObjectId(filter.sprintId);
    }
    if (filter.status) {
      const statuses = filter.status.split(',').map((s) => s.trim()).filter(Boolean);
      if (statuses.length) match.status = { $in: statuses };
    }
    return this.taskModel
      .find(match)
      .select('key title status priority storyPoints dueDate assigneeId createdAt')
      .sort({ key: 1 })
      .lean<
        Array<{
          key: string;
          title: string;
          status: string;
          priority: string;
          storyPoints?: number | null;
          dueDate?: Date | null;
          assigneeId?: Types.ObjectId | null;
          createdAt: Date;
        }>
      >()
      .exec();
  }
}
