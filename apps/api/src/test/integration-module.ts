import { randomUUID } from 'node:crypto';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Connection } from 'mongoose';
import { AppConfigService } from '../config/config.module';
import type { Env } from '../config/env.schema';
import { AuditService } from '../modules/audit/audit.service';
import { AuditLog, AuditLogSchema } from '../modules/audit/schemas/audit-log.schema';
import { AuditLogRepository, MongoAuditLogRepository } from '../modules/audit/audit.repository';
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
};

export interface MailSpy {
  sent: Array<{ to: string; token: string }>;
}

export interface TestContext {
  module: TestingModule;
  connection: Connection;
  auth: AuthService;
  orgs: OrganizationsService;
  mail: MailSpy;
}

/**
 * Builds a Nest testing module wired to a real (local) Mongo replica set, with
 * config + mail faked. Returns null if Mongo is unreachable so callers can skip.
 */
export async function createTestContext(): Promise<TestContext | null> {
  const mail: MailSpy = { sent: [] };
  const fakeConfig = {
    get: (key: keyof Env) => testEnv[key],
    isProduction: false,
    corsOrigins: [] as string[],
  } as unknown as AppConfigService;

  let module: TestingModule;
  try {
    module = await Test.createTestingModule({
      imports: [
        JwtModule.register({}),
        MongooseModule.forRoot(TEST_MONGO_URI, { serverSelectionTimeoutMS: 3000 }),
        MongooseModule.forFeature([
          { name: User.name, schema: UserSchema },
          { name: Organization.name, schema: OrganizationSchema },
          { name: Membership.name, schema: MembershipSchema },
          { name: AuditLog.name, schema: AuditLogSchema },
        ]),
      ],
      providers: [
        PasswordService,
        TokenService,
        AuthService,
        MembershipsService,
        OrganizationsService,
        AuditService,
        { provide: AppConfigService, useValue: fakeConfig },
        {
          provide: MailService,
          useValue: {
            sendPasswordReset: async (to: string, token: string) => {
              mail.sent.push({ to, token });
            },
          },
        },
        { provide: UsersRepository, useClass: MongoUsersRepository },
        { provide: OrganizationsRepository, useClass: MongoOrganizationsRepository },
        { provide: MembershipsRepository, useClass: MongoMembershipsRepository },
        { provide: AuditLogRepository, useClass: MongoAuditLogRepository },
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
    mail,
  };
}
