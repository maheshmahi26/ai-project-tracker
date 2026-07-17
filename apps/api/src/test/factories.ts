import type {
  CreateProjectInput,
  CreateTaskInput,
  OrganizationDTO,
  Role,
} from '@ai-projectos/shared';
import type { TestContext } from './integration-module';

/** Shared request metadata for audit/activity assertions in tests. */
export const META = { requestId: 'test', ip: '127.0.0.1', userAgent: 'vitest' };

// Monotonic counter → deterministic-but-unique emails within a single test,
// so a test that creates several users never collides on the unique email index.
let seq = 0;
export function uniqueEmail(prefix = 'user'): string {
  seq += 1;
  return `${prefix}-${seq}@example.com`;
}

export interface TestUser {
  userId: string;
  email: string;
  password: string;
}

/** Registers a local user and returns its id + credentials. */
export async function registerUser(
  ctx: TestContext,
  opts: { email?: string; password?: string; name?: string } = {},
): Promise<TestUser> {
  const email = opts.email ?? uniqueEmail();
  const password = opts.password ?? 'password123';
  const res = await ctx.auth.register({ email, password, name: opts.name ?? email }, META);
  return { userId: res.user.id, email, password };
}

/** Creates an org owned by `ownerId` (owner becomes admin). */
export function createOrg(
  ctx: TestContext,
  ownerId: string,
  name = 'Acme Inc',
): Promise<OrganizationDTO> {
  return ctx.orgs.createOrg(ownerId, { name, timezone: 'UTC' }, META);
}

export interface OrgWithAdmin {
  org: OrganizationDTO;
  admin: TestUser;
}

/** Registers an admin and creates their org — the most common test preamble. */
export async function setupOrgWithAdmin(
  ctx: TestContext,
  name = 'Acme Inc',
): Promise<OrgWithAdmin> {
  const admin = await registerUser(ctx, { email: uniqueEmail('admin') });
  const org = await createOrg(ctx, admin.userId, name);
  return { org, admin };
}

/** Admin-provisions a member with a temporary password (mustChangePassword=true). */
export async function createMember(
  ctx: TestContext,
  orgId: string,
  adminId: string,
  opts: { email?: string; name?: string; password?: string; role?: Exclude<Role, 'admin'> } = {},
): Promise<{ userId: string; email: string; password: string }> {
  const email = opts.email ?? uniqueEmail('member');
  const password = opts.password ?? 'temp-password-123';
  const membership = await ctx.orgs.createMember(
    orgId,
    adminId,
    { email, name: opts.name ?? email, password, role: opts.role ?? 'developer' },
    META,
  );
  return { userId: membership.userId, email, password };
}

export function createProject(
  ctx: TestContext,
  orgId: string,
  ownerId: string,
  overrides: Partial<CreateProjectInput> = {},
) {
  return ctx.projects.createProject(
    orgId,
    ownerId,
    { name: overrides.name ?? 'Auth', key: overrides.key ?? 'AUTH', ...overrides },
    META,
  );
}

export function createTask(
  ctx: TestContext,
  orgId: string,
  actorId: string,
  input: CreateTaskInput,
) {
  return ctx.tasks.createTask(orgId, actorId, input, META);
}
