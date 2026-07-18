import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../../test/integration-module';

const meta = { requestId: 'test', ip: '127.0.0.1', userAgent: 'vitest' };

async function setup(ctx: TestContext, email = 'owner@example.com') {
  const owner = await ctx.auth.register({ email, password: 'password123', name: 'Owner' }, meta);
  const org = await ctx.orgs.createOrg(owner.user.id, { name: 'Acme', timezone: 'UTC' }, meta);
  return { orgId: org.id, userId: owner.user.id };
}

async function uploadAndIndex(ctx: TestContext, orgId: string, userId: string, text: string, title = 'PRD') {
  const presigned = await ctx.documents.presign(orgId, {
    fileName: `${title}.txt`,
    mimeType: 'text/plain',
    sizeBytes: text.length,
  });
  ctx.storage.objects.set(presigned.storageKey, Buffer.from(text, 'utf8'));
  const doc = await ctx.documents.confirm(orgId, userId, {
    storageKey: presigned.storageKey,
    title,
    mimeType: 'text/plain',
    sizeBytes: text.length,
  });
  await ctx.documentIndexer.index(orgId, doc.id);
  return doc;
}

const PRD_TEXT = Array.from(
  { length: 40 },
  (_, i) => `Requirement ${i}: the authentication service must support requirement number ${i}.`,
).join(' ');

describe('RAG service (retrieval + grounded generation, faked Qdrant + Gemini)', () => {
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
    ctx.qdrant.reset();
    ctx.gemini.reset();
    ctx.storage.objects.clear();
  });

  it('search returns grounded chunks with citations (title + chunkIndex)', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId } = await setup(ctx);
    await uploadAndIndex(ctx, orgId, userId, PRD_TEXT, 'Auth PRD');

    const result = await ctx.rag.search(orgId, { query: 'authentication requirements', limit: 5 });

    expect(result.chunks.length).toBeGreaterThan(0);
    const first = result.chunks[0]!;
    expect(first.documentTitle).toBe('Auth PRD');
    expect(typeof first.chunkIndex).toBe('number');
    expect(first.snippet.length).toBeGreaterThan(0);
    expect(typeof first.score).toBe('number');
  });

  it('answer returns model prose plus deterministic citations', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId } = await setup(ctx);
    await uploadAndIndex(ctx, orgId, userId, PRD_TEXT, 'Auth PRD');

    ctx.gemini.scriptJson({ answer: 'It must support MFA and SSO.', hasAnswer: true });
    const res = await ctx.rag.answer(orgId, { question: 'What are the auth requirements?', limit: 5 });

    expect(res.answer).toContain('MFA');
    expect(res.citations.length).toBeGreaterThan(0);
    expect(res.citations[0]!.documentTitle).toBe('Auth PRD');
  });

  it('answer with no matching documents returns an honest "not found" and no citations', async (t) => {
    if (!ctx) return t.skip();
    const { orgId } = await setup(ctx);

    const res = await ctx.rag.answer(orgId, { question: 'anything', limit: 5 });
    expect(res.citations).toHaveLength(0);
    expect(res.answer.toLowerCase()).toContain("couldn't find");
    // No generation call happens when there is nothing to ground on.
    expect(ctx.gemini.jsonCalls).toHaveLength(0);
  });

  it('generateTasks proposes schema-valid tasks grounded in the document', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId } = await setup(ctx);
    const doc = await uploadAndIndex(ctx, orgId, userId, PRD_TEXT, 'Auth PRD');

    ctx.gemini.scriptJson({
      tasks: [
        { title: 'Implement login', description: 'JWT login', priority: 'high', storyPoints: 5 },
        { title: 'Add MFA', priority: 'medium' },
      ],
    });
    const plan = await ctx.rag.generateTasks(orgId, doc.id, 6);

    expect(plan.documentId).toBe(doc.id);
    expect(plan.documentTitle).toBe('Auth PRD');
    expect(plan.tasks).toHaveLength(2);
    expect(plan.tasks[0]!.priority).toBe('high');
    // default applied by the shared schema
    expect(plan.tasks[1]!.priority).toBe('medium');
  });

  it('generateTasks rejects a document that is not yet indexed', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId } = await setup(ctx);
    const presigned = await ctx.documents.presign(orgId, {
      fileName: 'x.txt',
      mimeType: 'text/plain',
      sizeBytes: 5,
    });
    const doc = await ctx.documents.confirm(orgId, userId, {
      storageKey: presigned.storageKey,
      title: 'Pending',
      mimeType: 'text/plain',
      sizeBytes: 5,
    });

    await expect(ctx.rag.generateTasks(orgId, doc.id, 6)).rejects.toThrow();
  });

  it('is tenant-isolated: org B cannot retrieve org A documents', async (t) => {
    if (!ctx) return t.skip();
    const a = await setup(ctx, 'a@example.com');
    const b = await setup(ctx, 'b@example.com');
    await uploadAndIndex(ctx, a.orgId, a.userId, PRD_TEXT, 'Secret PRD');

    const own = await ctx.rag.search(a.orgId, { query: 'requirements', limit: 5 });
    const other = await ctx.rag.search(b.orgId, { query: 'requirements', limit: 5 });

    expect(own.chunks.length).toBeGreaterThan(0);
    expect(other.chunks).toHaveLength(0);
  });
});
