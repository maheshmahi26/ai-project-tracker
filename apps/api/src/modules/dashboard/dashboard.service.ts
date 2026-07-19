import { Injectable } from '@nestjs/common';
import {
  ROLES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type BurndownDTO,
  type BurndownPointDTO,
  type DashboardOverviewDTO,
  type DashboardScopeQuery,
  type ExportTasksQuery,
  type PriorityDistributionDTO,
  type ProjectProgressDTO,
  type Role,
  type TaskPriority,
  type TaskStatus,
  type TasksPerUserDTO,
  type UsersByRoleDTO,
  type VelocityPointDTO,
  type WeeklyReportDTO,
  type WeeklyReportQuery,
} from '@ai-projectos/shared';
import { AppException } from '../../common/errors/app-exception';
import { MembershipsRepository } from '../organizations/memberships.repository';
import { DashboardCache } from './dashboard.cache';
import { DashboardRepository } from './dashboard.repository';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_BURNDOWN_DAYS = 60;

@Injectable()
export class DashboardService {
  constructor(
    private readonly repo: DashboardRepository,
    private readonly cache: DashboardCache,
    private readonly memberships: MembershipsRepository,
  ) {}

  usersByRole(orgId: string): Promise<UsersByRoleDTO> {
    return this.cache.wrap(orgId, 'users-by-role', {}, async () => {
      const rows = await this.memberships.countActiveByRole(orgId);
      const byRole = ROLES.reduce(
        (acc, role) => {
          acc[role] = 0;
          return acc;
        },
        {} as Record<Role, number>,
      );
      let total = 0;
      for (const row of rows) {
        if (row.role in byRole) byRole[row.role] = row.count;
        total += row.count;
      }
      return { total, byRole } satisfies UsersByRoleDTO;
    });
  }

  overview(orgId: string, query: DashboardScopeQuery): Promise<DashboardOverviewDTO> {
    return this.cache.wrap(orgId, 'overview', query, async () => {
      const now = new Date();
      const [taskRows, projRows, sprintRows, overdue] = await Promise.all([
        this.repo.tasksByStatus(orgId, query.projectId),
        this.repo.projectsByStatus(orgId),
        this.repo.sprintsByStatus(orgId, query.projectId),
        this.repo.countOverdueTasks(orgId, now, query.projectId),
      ]);

      const byStatus = emptyStatusRecord();
      let total = 0;
      for (const row of taskRows) {
        if (isTaskStatus(row._id)) byStatus[row._id] = row.count;
        total += row.count;
      }

      const projects = { total: 0, active: 0, archived: 0 };
      for (const row of projRows) {
        projects.total += row.count;
        if (row._id === 'active') projects.active = row.count;
        if (row._id === 'archived') projects.archived = row.count;
      }

      const sprints = { total: 0, planned: 0, active: 0, completed: 0 };
      let committed = 0;
      let completed = 0;
      for (const row of sprintRows) {
        sprints.total += row.count;
        if (row._id === 'planned') sprints.planned = row.count;
        if (row._id === 'active') sprints.active = row.count;
        if (row._id === 'completed') sprints.completed = row.count;
        committed += row.committed;
        completed += row.completed;
      }

      return {
        projects,
        tasks: { total, open: total - byStatus.done, done: byStatus.done, overdue, byStatus },
        sprints,
        points: { committed, completed },
      } satisfies DashboardOverviewDTO;
    });
  }

  velocity(orgId: string, query: DashboardScopeQuery): Promise<VelocityPointDTO[]> {
    return this.cache.wrap(orgId, 'velocity', query, async () => {
      const sprints = await this.repo.listSprintsForVelocity(orgId, query.projectId);
      return sprints.map((s) => ({
        sprintId: s._id.toString(),
        name: s.name,
        status: s.status,
        committedPoints: s.committedPoints ?? 0,
        completedPoints: s.completedPoints ?? 0,
        endDate: s.endDate ? s.endDate.toISOString() : null,
      }));
    });
  }

  burndown(orgId: string, sprintId: string): Promise<BurndownDTO> {
    return this.cache.wrap(orgId, 'burndown', { sprintId }, async () => {
      const sprint = await this.repo.findSprint(orgId, sprintId);
      if (!sprint) throw AppException.notFound('Sprint not found');

      const total =
        sprint.committedPoints && sprint.committedPoints > 0
          ? sprint.committedPoints
          : await this.repo.sumPointsInSprint(orgId, sprintId);

      const done = await this.repo.doneTasksInSprint(orgId, sprintId);

      const startBase = sprint.startDate ?? sprint.createdAt ?? new Date();
      const start = startOfDay(startBase);
      const endBase = sprint.endDate ?? new Date(start.getTime() + 13 * DAY_MS);
      const end = startOfDay(endBase);

      const dayCount = Math.min(
        MAX_BURNDOWN_DAYS,
        Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1),
      );

      const points: BurndownPointDTO[] = [];
      for (let i = 0; i < dayCount; i += 1) {
        const dayStart = new Date(start.getTime() + i * DAY_MS);
        const dayEnd = new Date(dayStart.getTime() + DAY_MS);
        const burned = done.reduce(
          (sum, t) => (t.updatedAt < dayEnd ? sum + (t.storyPoints ?? 0) : sum),
          0,
        );
        const ideal = dayCount > 1 ? total * (1 - i / (dayCount - 1)) : 0;
        points.push({
          date: dayStart.toISOString().slice(0, 10),
          ideal: round1(ideal),
          remaining: Math.max(0, total - burned),
        });
      }

      return {
        sprintId,
        name: sprint.name,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        totalPoints: total,
        points,
      } satisfies BurndownDTO;
    });
  }

  tasksPerUser(orgId: string, query: DashboardScopeQuery): Promise<TasksPerUserDTO[]> {
    return this.cache.wrap(orgId, 'tasks-per-user', query, async () => {
      const rows = await this.repo.tasksPerUser(orgId, query.projectId);
      return rows.map((r) => ({
        assigneeId: r._id ? r._id.toString() : null,
        total: r.total,
        done: r.done,
        open: r.total - r.done,
        points: r.points,
      }));
    });
  }

  priorityDistribution(
    orgId: string,
    query: DashboardScopeQuery,
  ): Promise<PriorityDistributionDTO[]> {
    return this.cache.wrap(orgId, 'priority-distribution', query, async () => {
      const rows = await this.repo.priorityDistribution(orgId, query.projectId);
      const counts = new Map(rows.map((r) => [r._id, r.count]));
      return TASK_PRIORITIES.map((priority) => ({
        priority,
        count: counts.get(priority) ?? 0,
      }));
    });
  }

  projectProgress(orgId: string): Promise<ProjectProgressDTO[]> {
    return this.cache.wrap(orgId, 'project-progress', {}, async () => {
      const [rollups, projects] = await Promise.all([
        this.repo.projectRollups(orgId),
        this.repo.listActiveProjects(orgId),
      ]);
      const byId = new Map(rollups.map((r) => [r._id.toString(), r]));
      return projects.map((p) => {
        const r = byId.get(p._id.toString());
        const total = r?.total ?? 0;
        const done = r?.done ?? 0;
        return {
          projectId: p._id.toString(),
          key: p.key,
          name: p.name,
          total,
          done,
          open: total - done,
          percentComplete: total > 0 ? Math.round((done / total) * 100) : 0,
          points: r?.points ?? 0,
          donePoints: r?.donePoints ?? 0,
        };
      });
    });
  }

  weeklyReport(orgId: string, query: WeeklyReportQuery): Promise<WeeklyReportDTO> {
    return this.cache.wrap(orgId, 'weekly-report', query, async () => {
      const end = query.weekOf ? new Date(query.weekOf) : new Date();
      const start = new Date(end.getTime() - 7 * DAY_MS);
      const { projectId } = query;

      const [createdCount, completedCount, createdByPr, activeSprints, contributors] =
        await Promise.all([
          this.repo.countTasksCreatedBetween(orgId, start, end, projectId),
          this.repo.countCompletedBetween(orgId, start, end, projectId),
          this.repo.createdByPriorityBetween(orgId, start, end, projectId),
          this.repo.countActiveSprints(orgId, projectId),
          this.repo.topContributorsBetween(orgId, start, end, projectId),
        ]);

      const createdByPriority = emptyPriorityRecord();
      for (const row of createdByPr) {
        if (isTaskPriority(row._id)) createdByPriority[row._id] = row.count;
      }

      return {
        rangeStart: start.toISOString(),
        rangeEnd: end.toISOString(),
        createdCount,
        completedCount,
        createdByPriority,
        activeSprints,
        topContributors: contributors.map((c) => ({
          assigneeId: c._id.toString(),
          done: c.done,
        })),
      } satisfies WeeklyReportDTO;
    });
  }

  async exportTasksCsv(orgId: string, query: ExportTasksQuery): Promise<string> {
    const rows = await this.repo.exportTasks(orgId, query);
    const header = [
      'key',
      'title',
      'status',
      'priority',
      'storyPoints',
      'dueDate',
      'assigneeId',
      'createdAt',
    ];
    const lines = rows.map((t) => [
      t.key,
      t.title,
      t.status,
      t.priority,
      t.storyPoints != null ? String(t.storyPoints) : '',
      t.dueDate ? t.dueDate.toISOString() : '',
      t.assigneeId ? t.assigneeId.toString() : '',
      t.createdAt ? t.createdAt.toISOString() : '',
    ]);
    return toCsv(header, lines);
  }
}

function emptyStatusRecord(): Record<TaskStatus, number> {
  return TASK_STATUSES.reduce(
    (acc, s) => {
      acc[s] = 0;
      return acc;
    },
    {} as Record<TaskStatus, number>,
  );
}

function emptyPriorityRecord(): Record<TaskPriority, number> {
  return TASK_PRIORITIES.reduce(
    (acc, p) => {
      acc[p] = 0;
      return acc;
    },
    {} as Record<TaskPriority, number>,
  );
}

function isTaskStatus(v: string): v is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(v);
}

function isTaskPriority(v: string): v is TaskPriority {
  return (TASK_PRIORITIES as readonly string[]).includes(v);
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** RFC-4180-ish CSV: quote fields containing commas, quotes, or newlines. */
function toCsv(header: string[], rows: string[][]): string {
  const escape = (value: string): string =>
    /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const all = [header, ...rows];
  return all.map((row) => row.map(escape).join(',')).join('\r\n');
}
