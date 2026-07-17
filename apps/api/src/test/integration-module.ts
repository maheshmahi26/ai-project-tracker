import { randomUUID } from 'node:crypto';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Connection } from 'mongoose';
import { AppConfigService } from '../config/config.module';
import type { Env } from '../config/env.schema';
import { AuditService } from '../modules/audit/audit.service';
import { AuditLog, AuditLogSchema } from '../modules/audit/schemas/audit-log.schema';
import { AuditLogRepository, MongoAuditLogRepository } from '../modules/audit/audit.repository';
import { ActivityService } from '../modules/activity/activity.service';
import {
  ActivityLog,
  ActivityLogSchema,
} from '../modules/activity/schemas/activity-log.schema';
import {
  ActivityLogRepository,
  MongoActivityLogRepository,
} from '../modules/activity/activity.repository';
import { DomainEventBus } from '../modules/events/domain-event-bus';
import { AuditActivityListener } from '../modules/events/audit-activity.listener';
import { ProjectsService } from '../modules/projects/projects.service';
import { MongoProjectsRepository, ProjectsRepository } from '../modules/projects/projects.repository';
import { Project, ProjectSchema } from '../modules/projects/schemas/project.schema';
import { SprintsService } from '../modules/sprints/sprints.service';
import { MongoSprintsRepository, SprintsRepository } from '../modules/sprints/sprints.repository';
import { Sprint, SprintSchema } from '../modules/sprints/schemas/sprint.schema';
import { TasksService } from '../modules/tasks/tasks.service';
import { MongoTasksRepository, TasksRepository } from '../modules/tasks/tasks.repository';
import { Task, TaskSchema } from '../modules/tasks/schemas/task.schema';
import { CommentsService } from '../modules/comments/comments.service';
import { CommentsRepository, MongoCommentsRepository } from '../modules/comments/comments.repository';
import { Comment, CommentSchema } from '../modules/comments/schemas/comment.schema';
import { LabelsService } from '../modules/labels/labels.service';
import { LabelsRepository, MongoLabelsRepository } from '../modules/labels/labels.repository';
import { Label, LabelSchema } from '../modules/labels/schemas/label.schema';
import { FilesService } from '../modules/files/files.service';
import { FilesRepository, MongoFilesRepository } from '../modules/files/files.repository';
import { FileAsset, FileSchema } from '../modules/files/schemas/file.schema';
import { StorageService } from '../modules/files/storage/storage.service';
import { NotificationsService } from '../modules/notifications/notifications.service';
import {
  MongoNotificationsRepository,
  NotificationsRepository,
} from '../modules/notifications/notifications.repository';
import {
  Notification,
  NotificationSchema,
} from '../modules/notifications/schemas/notification.schema';
import { NotificationsListener } from '../modules/notifications/notifications.listener';
import { DashboardService } from '../modules/dashboard/dashboard.service';
import { DashboardRepository } from '../modules/dashboard/dashboard.repository';
import { DashboardCache } from '../modules/dashboard/dashboard.cache';
import { UsersService } from '../modules/users/users.service';
import { GeminiClient } from '../infra/ai/gemini.client';
import { FakeGeminiClient } from './fake-gemini';
import { ChatService } from '../modules/ai/chat.service';
import { AgentService } from '../modules/ai/agent.service';
import { AgentRunner } from '../modules/ai/agent/agent-runner.service';
import { ToolRegistry } from '../modules/ai/tools/tool-registry';
import { AI_TOOLS, ToolRegistrar } from '../modules/ai/tools/tool-registrar';
import { createWhoAmITool } from '../modules/ai/tools/who-am-i.tool';
import { ChatSession, ChatSessionSchema } from '../modules/ai/schemas/chat-session.schema';
import { ChatMessage, ChatMessageSchema } from '../modules/ai/schemas/chat-message.schema';
import { AiExecution, AiExecutionSchema } from '../modules/ai/schemas/ai-execution.schema';
import {
  ChatSessionsRepository,
  MongoChatSessionsRepository,
} from '../modules/ai/repositories/chat-sessions.repository';
import {
  ChatMessagesRepository,
  MongoChatMessagesRepository,
} from '../modules/ai/repositories/chat-messages.repository';
import {
  AiExecutionsRepository,
  MongoAiExecutionsRepository,
} from '../modules/ai/repositories/ai-executions.repository';
import { AuthService } from '../modules/auth/auth.service';
import { PasswordService } from '../modules/auth/password.service';
import { TokenService } from '../modules/auth/token.service';
import { MailService } from '../modules/mail/mail.service';
import { MembershipsService } from '../modules/organizations/memberships.service';
import {
  MembershipsRepository,
  MongoMembershipsRepository,
} from '../modules/organizations/memberships.repository';
import { OrganizationsService } from '../modules/organizations/organizations.service';
import {
  MongoOrganizationsRepository,
  OrganizationsRepository,
} from '../modules/organizations/organizations.repository';
import { Membership, MembershipSchema } from '../modules/organizations/schemas/membership.schema';
import {
  Organization,
  OrganizationSchema,
} from '../modules/organizations/schemas/organization.schema';
import { MongoUsersRepository, UsersRepository } from '../modules/users/users.repository';
import { User, UserSchema } from '../modules/users/schemas/user.schema';

// Each test file gets an isolated DB so parallel vitest files never collide.
const TEST_DB = `apos_test_${randomUUID().slice(0, 8)}`;
export const TEST_MONGO_URI =
  process.env.TEST_MONGODB_URI ??
  `mongodb://localhost:27017/${TEST_DB}?replicaSet=rs0&directConnection=true`;

const testEnv: Partial<Env> = {
  JWT_ACCESS_SECRET: 'test-access-secret-value',
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_SECRET: 'test-refresh-secret-value',
  JWT_REFRESH_TTL: '7d',
  RESET_TOKEN_TTL_MIN: 30,
  WEB_APP_URL: 'http://localhost:5173',
  GEMINI_MODEL: 'gemini-test',
  GEMINI_EMBED_MODEL: 'text-embedding-004',
  AI_MAX_ITERATIONS: 3,
  AI_TOKEN_BUDGET: 24000,
  AI_NODE_TIMEOUT_MS: 45000,
  AI_RUN_TIMEOUT_MS: 120000,
};

export interface MailSpy {
  sent: Array<{ to: string; token: string }>;
  notifications: Array<{ to: string; subject: string; text: string }>;
}

/** Records presign/download/delete calls; upload/download URLs are faked. */
export interface StorageSpy {
  uploads: Array<{ key: string; contentType: string }>;
  downloads: Array<{ key: string; fileName?: string }>;
  deleted: string[];
}

export interface TestContext {
  module: TestingModule;
  connection: Connection;
  auth: AuthService;
  orgs: OrganizationsService;
  projects: ProjectsService;
  sprints: SprintsService;
  tasks: TasksService;
  comments: CommentsService;
  labels: LabelsService;
  files: FilesService;
  notifications: NotificationsService;
  dashboard: DashboardService;
  activity: ActivityService;
  audit: AuditService;
  chat: ChatService;
  agent: AgentService;
  toolRegistry: ToolRegistry;
  gemini: FakeGeminiClient;
  mail: MailSpy;
  storage: StorageSpy;
}

/**
 * Builds a Nest testing module wired to a real (local) Mongo replica set, with
 * config + mail faked. Returns null if Mongo is unreachable so callers can skip.
 */
export async function createTestContext(): Promise<TestContext | null> {
  const mail: MailSpy = { sent: [], notifications: [] };
  const storageSpy: StorageSpy = { uploads: [], downloads: [], deleted: [] };
  const fakeGemini = new FakeGeminiClient();
  const fakeStorage: StorageService = {
    urlTtlSec: 900,
    presignUpload: async ({ key, contentType }) => {
      storageSpy.uploads.push({ key, contentType });
      return `https://storage.test/upload/${encodeURIComponent(key)}`;
    },
    presignDownload: async ({ key, fileName }) => {
      storageSpy.downloads.push({ key, fileName });
      return `https://storage.test/download/${encodeURIComponent(key)}`;
    },
    deleteObject: async (key) => {
      storageSpy.deleted.push(key);
    },
  };
  const fakeConfig = {
    get: (key: keyof Env) => testEnv[key],
    isProduction: false,
    corsOrigins: [] as string[],
  } as unknown as AppConfigService;

  let module: TestingModule;
  try {
    module = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot({ wildcard: true }),
        JwtModule.register({}),
        MongooseModule.forRoot(TEST_MONGO_URI, { serverSelectionTimeoutMS: 3000 }),
        MongooseModule.forFeature([
          { name: User.name, schema: UserSchema },
          { name: Organization.name, schema: OrganizationSchema },
          { name: Membership.name, schema: MembershipSchema },
          { name: AuditLog.name, schema: AuditLogSchema },
          { name: ActivityLog.name, schema: ActivityLogSchema },
          { name: Project.name, schema: ProjectSchema },
          { name: Sprint.name, schema: SprintSchema },
          { name: Task.name, schema: TaskSchema },
          { name: Comment.name, schema: CommentSchema },
          { name: Label.name, schema: LabelSchema },
          { name: FileAsset.name, schema: FileSchema },
          { name: Notification.name, schema: NotificationSchema },
          { name: ChatSession.name, schema: ChatSessionSchema },
          { name: ChatMessage.name, schema: ChatMessageSchema },
          { name: AiExecution.name, schema: AiExecutionSchema },
        ]),
      ],
      providers: [
        PasswordService,
        TokenService,
        AuthService,
        MembershipsService,
        OrganizationsService,
        AuditService,
        ActivityService,
        ProjectsService,
        SprintsService,
        TasksService,
        CommentsService,
        LabelsService,
        FilesService,
        NotificationsService,
        NotificationsListener,
        UsersService,
        ChatService,
        AgentService,
        AgentRunner,
        ToolRegistry,
        ToolRegistrar,
        {
          provide: AI_TOOLS,
          useFactory: (users: UsersService) => [createWhoAmITool(users)],
          inject: [UsersService],
        },
        { provide: GeminiClient, useValue: fakeGemini },
        { provide: ChatSessionsRepository, useClass: MongoChatSessionsRepository },
        { provide: ChatMessagesRepository, useClass: MongoChatMessagesRepository },
        { provide: AiExecutionsRepository, useClass: MongoAiExecutionsRepository },
        DashboardService,
        DashboardRepository,
        // No-op cache in tests: always computes fresh so assertions are deterministic.
        {
          provide: DashboardCache,
          useValue: {
            wrap: <T>(_o: string, _n: string, _p: unknown, fn: () => Promise<T>) => fn(),
            invalidateOrg: async () => {},
          } as unknown as DashboardCache,
        },
        DomainEventBus,
        AuditActivityListener,
        { provide: AppConfigService, useValue: fakeConfig },
        {
          provide: MailService,
          useValue: {
            sendPasswordReset: async (to: string, token: string) => {
              mail.sent.push({ to, token });
            },
            sendNotification: async (to: string, subject: string, text: string) => {
              mail.notifications.push({ to, subject, text });
            },
          },
        },
        { provide: StorageService, useValue: fakeStorage },
        { provide: UsersRepository, useClass: MongoUsersRepository },
        { provide: OrganizationsRepository, useClass: MongoOrganizationsRepository },
        { provide: MembershipsRepository, useClass: MongoMembershipsRepository },
        { provide: AuditLogRepository, useClass: MongoAuditLogRepository },
        { provide: ActivityLogRepository, useClass: MongoActivityLogRepository },
        { provide: ProjectsRepository, useClass: MongoProjectsRepository },
        { provide: SprintsRepository, useClass: MongoSprintsRepository },
        { provide: TasksRepository, useClass: MongoTasksRepository },
        { provide: CommentsRepository, useClass: MongoCommentsRepository },
        { provide: LabelsRepository, useClass: MongoLabelsRepository },
        { provide: FilesRepository, useClass: MongoFilesRepository },
        { provide: NotificationsRepository, useClass: MongoNotificationsRepository },
      ],
    }).compile();
    await module.init();
  } catch {
    return null;
  }

  const connection = module.get<Connection>(getConnectionToken());
  await connection.dropDatabase();

  return {
    module,
    connection,
    auth: module.get(AuthService),
    orgs: module.get(OrganizationsService),
    projects: module.get(ProjectsService),
    sprints: module.get(SprintsService),
    tasks: module.get(TasksService),
    comments: module.get(CommentsService),
    labels: module.get(LabelsService),
    files: module.get(FilesService),
    notifications: module.get(NotificationsService),
    dashboard: module.get(DashboardService),
    activity: module.get(ActivityService),
    audit: module.get(AuditService),
    chat: module.get(ChatService),
    agent: module.get(AgentService),
    toolRegistry: module.get(ToolRegistry),
    gemini: fakeGemini,
    mail,
    storage: storageSpy,
  };
}
