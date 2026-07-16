import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../test/integration-module';

const meta = { requestId: 'test', ip: '127.0.0.1', userAgent: 'vitest' };

interface Ctx {
  orgId: string;
  userId: string;
  projectId: string;
  taskId: string;
}

async function setup(ctx: TestContext): Promise<Ctx> {
  const owner = await ctx.auth.register(
    { email: 'owner@example.com', password: 'password123', name: 'Owner' },
    meta,
  );
  const org = await ctx.orgs.createOrg(owner.user.id, { name: 'Acme', timezone: 'UTC' }, meta);
  const project = await ctx.projects.createProject(
    org.id,
    owner.user.id,
    { name: 'Auth', key: 'AUTH' },
    meta,
  );
  const task = await ctx.tasks.createTask(org.id, owner.user.id, { projectId: project.id, title: 'T' }, meta);
  return { orgId: org.id, userId: owner.user.id, projectId: project.id, taskId: task.id };
}

describe('Files backend (integration, mocked storage)', () => {
  let ctx: TestContext | null;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    if (ctx) {
      await ctx.connection.dropDatabase();
      await ctx.module.close();
    }
  });

  beforeEach(async () => {
    if (!ctx) return;
    await ctx.connection.dropDatabase();
    await ctx.connection.models.Project?.syncIndexes();
    await ctx.connection.models.Task?.syncIndexes();
    ctx.storage.uploads.length = 0;
    ctx.storage.downloads.length = 0;
    ctx.storage.deleted.length = 0;
  });

  it('round-trips presign → confirm → download and increments the task attachment count', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId, taskId } = await setup(ctx);

    const presigned = await ctx.files.presign(orgId, {
      fileName: 'spec.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      scope: { type: 'task', id: taskId },
    });
    expect(presigned.url).toContain('https://storage.test/upload/');
    expect(presigned.storageKey).toContain(`orgs/${orgId}/task/${taskId}/`);
    expect(ctx.storage.uploads).toHaveLength(1);

    const file = await ctx.files.confirm(
      orgId,
      userId,
      {
        storageKey: presigned.storageKey,
        fileName: 'spec.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        scope: { type: 'task', id: taskId },
      },
      meta,
    );
    expect(file.uploaderId).toBe(userId);

    const task = await ctx.tasks.getTask(orgId, taskId);
    expect(task.attachmentsCount).toBe(1);

    const download = await ctx.files.download(orgId, file.id);
    expect(download.url).toContain('https://storage.test/download/');
    expect(ctx.storage.downloads).toHaveLength(1);

    const audits = await ctx.audit.list(orgId, { action: 'file.uploaded', limit: 25 });
    expect(audits.items[0]?.entity).toEqual({ type: 'file', id: file.id });
  });

  it('deletes a file, decrements the count, and removes the object', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId, taskId } = await setup(ctx);
    const presigned = await ctx.files.presign(orgId, {
      fileName: 'a.png',
      mimeType: 'image/png',
      sizeBytes: 500,
      scope: { type: 'task', id: taskId },
    });
    const file = await ctx.files.confirm(
      orgId,
      userId,
      {
        storageKey: presigned.storageKey,
        fileName: 'a.png',
        mimeType: 'image/png',
        sizeBytes: 500,
        scope: { type: 'task', id: taskId },
      },
      meta,
    );

    await ctx.files.remove(orgId, userId, file.id, meta);

    expect(ctx.storage.deleted).toContain(file.storageKey);
    const task = await ctx.tasks.getTask(orgId, taskId);
    expect(task.attachmentsCount).toBe(0);
    await expect(ctx.files.download(orgId, file.id)).rejects.toThrow();
  });

  it('rejects presign for a scope target that does not exist', async (t) => {
    if (!ctx) return t.skip();
    const { orgId } = await setup(ctx);
    await expect(
      ctx.files.presign(orgId, {
        fileName: 'x.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
        scope: { type: 'task', id: '64b7f0000000000000000000' },
      }),
    ).rejects.toThrow();
  });

  it('isolates files across organizations', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId, taskId } = await setup(ctx);
    const presigned = await ctx.files.presign(orgId, {
      fileName: 'a.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 100,
      scope: { type: 'task', id: taskId },
    });
    const file = await ctx.files.confirm(
      orgId,
      userId,
      {
        storageKey: presigned.storageKey,
        fileName: 'a.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        scope: { type: 'task', id: taskId },
      },
      meta,
    );

    const other = await ctx.auth.register(
      { email: 'other@example.com', password: 'password123', name: 'Other' },
      meta,
    );
    const otherOrg = await ctx.orgs.createOrg(other.user.id, { name: 'Other', timezone: 'UTC' }, meta);

    await expect(ctx.files.download(otherOrg.id, file.id)).rejects.toThrow();
  });
});
