import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppConfigModule } from '../../config/config.module';
import { AiInfraModule } from '../../infra/ai/ai-infra.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { UsersModule } from '../users/users.module';
import { UsersService } from '../users/users.service';
import { ProjectsModule } from '../projects/projects.module';
import { ProjectsService } from '../projects/projects.service';
import { TasksModule } from '../tasks/tasks.module';
import { TasksService } from '../tasks/tasks.service';
import { SprintsModule } from '../sprints/sprints.module';
import { SprintsService } from '../sprints/sprints.service';
import { CommentsModule } from '../comments/comments.module';
import { CommentsService } from '../comments/comments.service';
import { LabelsModule } from '../labels/labels.module';
import { LabelsService } from '../labels/labels.service';
import { DashboardModule } from '../dashboard/dashboard.module';
import { DashboardService } from '../dashboard/dashboard.service';
import { DocumentsModule } from '../documents/documents.module';
import { DocumentsRepository } from '../documents/documents.repository';
import { RagService } from '../documents/rag/rag.service';
import { GeminiClient } from '../../infra/ai/gemini.client';
import { AiController } from './ai.controller';
import { ChatService } from './chat.service';
import { AgentService } from './agent.service';
import { AgentRunner } from './agent/agent-runner.service';
import { MemoryService } from './memory/memory.service';
import { MemoryResolver } from './memory/memory-resolver.service';
import { Clock } from './memory/clock';
import { ToolRegistry } from './tools/tool-registry';
import { AI_TOOLS, ToolRegistrar } from './tools/tool-registrar';
import { ReferenceResolver } from './tools/reference-resolver';
import { createWhoAmITool } from './tools/who-am-i.tool';
import { createTaskTools } from './tools/task-tools';
import { createProjectTools } from './tools/project-tools';
import { createSprintTools } from './tools/sprint-tools';
import { createCollabTools } from './tools/collab-tools';
import { createGenerativeTools } from './tools/generative-tools';
import { createRagTools } from './tools/rag-tools';
import { createMemoryTools } from './tools/memory-tools';
import { ChatSession, ChatSessionSchema } from './schemas/chat-session.schema';
import { ChatMessage, ChatMessageSchema } from './schemas/chat-message.schema';
import { AiExecution, AiExecutionSchema } from './schemas/ai-execution.schema';
import {
  ChatSessionsRepository,
  MongoChatSessionsRepository,
} from './repositories/chat-sessions.repository';
import {
  ChatMessagesRepository,
  MongoChatMessagesRepository,
} from './repositories/chat-messages.repository';
import {
  AiExecutionsRepository,
  MongoAiExecutionsRepository,
} from './repositories/ai-executions.repository';

@Module({
  imports: [
    AppConfigModule,
    AiInfraModule,
    OrganizationsModule,
    UsersModule,
    ProjectsModule,
    TasksModule,
    SprintsModule,
    CommentsModule,
    LabelsModule,
    DashboardModule,
    DocumentsModule,
    MongooseModule.forFeature([
      { name: ChatSession.name, schema: ChatSessionSchema },
      { name: ChatMessage.name, schema: ChatMessageSchema },
      { name: AiExecution.name, schema: AiExecutionSchema },
    ]),
  ],
  controllers: [AiController],
  providers: [
    ChatService,
    AgentService,
    AgentRunner,
    MemoryService,
    MemoryResolver,
    Clock,
    ToolRegistry,
    ToolRegistrar,
    ReferenceResolver,
    // The full tool catalogue is assembled here. Every tool wraps an existing
    // Application service, so the agent has exactly the same reach as the UI.
    {
      provide: AI_TOOLS,
      useFactory: (
        users: UsersService,
        tasks: TasksService,
        projects: ProjectsService,
        sprints: SprintsService,
        comments: CommentsService,
        labels: LabelsService,
        dashboard: DashboardService,
        gemini: GeminiClient,
        resolver: ReferenceResolver,
        rag: RagService,
        documents: DocumentsRepository,
        memoryResolver: MemoryResolver,
      ) => [
        createWhoAmITool(users),
        ...createTaskTools(tasks, resolver),
        ...createProjectTools(projects, resolver),
        ...createSprintTools(sprints, tasks, resolver),
        ...createCollabTools(comments, labels, resolver),
        ...createGenerativeTools({ gemini, tasks, projects, sprints, dashboard, resolver }),
        ...createRagTools({ rag, documents, tasks, resolver }),
        ...createMemoryTools(memoryResolver),
      ],
      inject: [
        UsersService,
        TasksService,
        ProjectsService,
        SprintsService,
        CommentsService,
        LabelsService,
        DashboardService,
        GeminiClient,
        ReferenceResolver,
        RagService,
        DocumentsRepository,
        MemoryResolver,
      ],
    },
    { provide: ChatSessionsRepository, useClass: MongoChatSessionsRepository },
    { provide: ChatMessagesRepository, useClass: MongoChatMessagesRepository },
    { provide: AiExecutionsRepository, useClass: MongoAiExecutionsRepository },
  ],
  exports: [ToolRegistry, ChatService],
})
export class AiModule {}
