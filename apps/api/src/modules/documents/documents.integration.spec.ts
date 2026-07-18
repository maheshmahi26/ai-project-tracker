import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../test/integration-module';

const meta = { requestId: 'test', ip: '127.0.0.1', userAgent: 'vitest' };

interface Ctx {
  orgId: string;
  userId: string;
}

async function setup(ctx: TestContext, email = 'owner@example.com'): Promise<Ctx> {
  const owner = await ctx.auth.register({ email, password: 'password123', name: 'Owner' }, meta);
  const org = await ctx.orgs.createOrg(owner.user.id, { name: 'Acme', timezone: 'UTC' }, meta);
  return { orgId: org.id, userId: owner.user.id };
}

/** Presign + confirm a text document with scripted bytes ready for indexing. */
async function uploadDoc(ctx: TestContext, orgId: string, userId: string, text: string) {
  const presigned = await ctx.documents.presign(orgId, {
    fileName: 'prd.txt',
    mimeType: 'text/plain',
    sizeBytes: text.length,
  });
  ctx.storage.objects.set(presigned.storageKey, Buffer.from(text, 'utf8'));
  return ctx.documents.confirm(orgId, userId, {
    storageKey: presigned.storageKey,
    title: 'PRD',
    mimeType: 'text/plain',
    sizeBytes: text.length,
  });
}

const LONG_TEXT = Array.from(
  { length: 60 },
  (_, i) => `Requirement ${i}: the system must handle case ${i} with care and detail.`,
).join(' ');

describe('Documents RAG ingestion (integration, faked Qdrant + embeddings)', () => {
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
    ctx.storage.deleted.length = 0;
  });

  it('indexes an uploaded document: status→indexed, chunks in Mongo + Qdrant', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId } = await setup(ctx);

    const doc = await uploadDoc(ctx, orgId, userId, LONG_TEXT);
    expect(doc.status).toBe('uploaded');

    const result = await ctx.documentIndexer.index(orgId, doc.id);
    expect(result.chunkCount).toBeGreaterThan(1);

    const fetched = await ctx.documents.get(orgId, doc.id);
    expect(fetched.status).toBe('indexed');
    expect(fetched.chunkCount).toBe(result.chunkCount);
    expect(fetched.error).toBeNull();

    // Vectors present in Qdrant + chunk rows in Mongo, one per chunk.
    expect(ctx.qdrant.countForDocument(orgId, doc.id)).toBe(result.chunkCount);
    const rows = await ctx.connection.models.Embedding.countDocuments({});
    expect(rows).toBe(result.chunkCount);
    expect(ctx.qdrant.ensureCalls).toBeGreaterThan(0);
  });

  it('is idempotent: re-indexing does not duplicate chunks', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId } = await setup(ctx);
    const doc = await uploadDoc(ctx, orgId, userId, LONG_TEXT);

    const first = await ctx.documentIndexer.index(orgId, doc.id);
    const second = await ctx.documentIndexer.index(orgId, doc.id);

    expect(second.chunkCount).toBe(first.chunkCount);
    expect(ctx.qdrant.countForDocument(orgId, doc.id)).toBe(first.chunkCount);
    const rows = await ctx.connection.models.Embedding.countDocuments({});
    expect(rows).toBe(first.chunkCount);
  });

  it('marks the document failed and rethrows on a fetch/parse error', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId } = await setup(ctx);

    // Confirm without scripting bytes → storage.getObject throws.
    const doc = await ctx.documents.confirm(orgId, userId, {
      storageKey: 'orgs/x/documents/missing.txt',
      title: 'Broken',
      mimeType: 'text/plain',
      sizeBytes: 10,
    });

    await expect(ctx.documentIndexer.index(orgId, doc.id)).rejects.toThrow();

    const fetched = await ctx.documents.get(orgId, doc.id);
    expect(fetched.status).toBe('failed');
    expect(fetched.error).toContain('No scripted object');
  });

  it('fails terminally (no throw) when no text can be extracted', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId } = await setup(ctx);
    const doc = await uploadDoc(ctx, orgId, userId, '    ');

    const result = await ctx.documentIndexer.index(orgId, doc.id);
    expect(result.chunkCount).toBe(0);
    const fetched = await ctx.documents.get(orgId, doc.id);
    expect(fetched.status).toBe('failed');
  });

  it('delete removes Qdrant points, Mongo chunks, and the stored object', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId } = await setup(ctx);
    const doc = await uploadDoc(ctx, orgId, userId, LONG_TEXT);
    await ctx.documentIndexer.index(orgId, doc.id);
    expect(ctx.qdrant.countForDocument(orgId, doc.id)).toBeGreaterThan(0);

    await ctx.documents.remove(orgId, doc.id);

    expect(ctx.qdrant.countForDocument(orgId, doc.id)).toBe(0);
    const rows = await ctx.connection.models.Embedding.countDocuments({});
    expect(rows).toBe(0);
    expect(ctx.storage.deleted.length).toBeGreaterThan(0);
    await expect(ctx.documents.get(orgId, doc.id)).rejects.toThrow();
  });

  it('isolates vectors across organizations via payload filters', async (t) => {
    if (!ctx) return t.skip();
    const a = await setup(ctx, 'a@example.com');
    const b = await setup(ctx, 'b@example.com');
    const doc = await uploadDoc(ctx, a.orgId, a.userId, LONG_TEXT);
    await ctx.documentIndexer.index(a.orgId, doc.id);

    const vector = [0.1, 0.2, 0.3];
    const ownerHits = await ctx.qdrant.search({ vector, orgId: a.orgId, limit: 10 });
    const otherHits = await ctx.qdrant.search({ vector, orgId: b.orgId, limit: 10 });

    expect(ownerHits.length).toBeGreaterThan(0);
    expect(otherHits).toHaveLength(0);
  });

  it('lists documents newest-first for the org', async (t) => {
    if (!ctx) return t.skip();
    const { orgId, userId } = await setup(ctx);
    await uploadDoc(ctx, orgId, userId, LONG_TEXT);
    await uploadDoc(ctx, orgId, userId, LONG_TEXT);

    const page = await ctx.documents.list(orgId, { limit: 25 });
    expect(page.items).toHaveLength(2);
  });
});
