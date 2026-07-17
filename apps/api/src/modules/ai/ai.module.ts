import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppConfigModule } from '../../config/config.module';
import { AiInfraModule } from '../../infra/ai/ai-infra.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { UsersModule } from '../users/users.module';
import { UsersService } from '../users/users.service';
import { AiController } from './ai.controller';
import { ChatService } from './chat.service';
import { AgentService } from './agent.service';
import { AgentRunner } from './agent/agent-runner.service';
import { ToolRegistry } from './tools/tool-registry';
import { AI_TOOLS, ToolRegistrar } from './tools/tool-registrar';
import { createWhoAmITool } from './tools/who-am-i.tool';
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
    ToolRegistry,
    ToolRegistrar,
    // Each tool is a multi-provider so adding one never touches central wiring.
    {
      provide: AI_TOOLS,
      useFactory: (users: UsersService) => [createWhoAmITool(users)],
      inject: [UsersService],
    },
    { provide: ChatSessionsRepository, useClass: MongoChatSessionsRepository },
    { provide: ChatMessagesRepository, useClass: MongoChatMessagesRepository },
    { provide: AiExecutionsRepository, useClass: MongoAiExecutionsRepository },
  ],
  exports: [ToolRegistry, ChatService],
})
export class AiModule {}
