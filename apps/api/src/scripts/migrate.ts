import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { AppModule } from '../app.module';
import { AppConfigService } from '../config/config.module';

/**
 * Idempotent migration / bootstrap runner. Run as a deploy step before the new
 * API/worker take traffic (and locally via `make migrate`). It:
 *   1. Syncs every Mongo collection's indexes (incl. text indexes) with its
 *      Mongoose schema — required in prod where `autoIndex` is disabled.
 *   2. Bootstraps the Qdrant collection used for RAG (placeholder here; points
 *      are written in TASK-20). Non-fatal so a missing Qdrant never blocks a deploy.
 *
 * See specs/09-devops-deployment.md → "Migrations".
 */

// Qdrant collection contract. Name + vector dim come from config so they always
// match the Gemini embedding output the ingestion worker upserts (TASK-20).
const QDRANT_DISTANCE = 'Cosine';

async function run(): Promise<void> {
  const logger = new Logger('Migrate');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const connection = app.get<Connection>(getConnectionToken());
    const config = app.get(AppConfigService);

    // 1) Mongo indexes — idempotent; aligns each model's indexes with its schema.
    const modelNames = connection.modelNames().sort();
    logger.log(`Syncing indexes for ${modelNames.length} collections…`);
    for (const name of modelNames) {
      await connection.model(name).syncIndexes();
      logger.log(`  ✓ ${name}`);
    }

    // 1b) Role rename: the `viewer` role was replaced by `tester`. Migrate any
    // remaining memberships so they satisfy the new enum. Idempotent.
    if (connection.modelNames().includes('Membership')) {
      const res = await connection
        .model('Membership')
        .updateMany({ role: 'viewer' }, { $set: { role: 'tester' } })
        .exec();
      if (res.modifiedCount > 0) {
        logger.log(`Migrated ${res.modifiedCount} 'viewer' membership(s) → 'tester'.`);
      }
    }

    // 1c) Tasks created before the `type` field default to 'task'. Idempotent.
    if (connection.modelNames().includes('Task')) {
      const res = await connection
        .model('Task')
        .updateMany({ type: { $exists: false } }, { $set: { type: 'task' } })
        .exec();
      if (res.modifiedCount > 0) {
        logger.log(`Backfilled 'type' on ${res.modifiedCount} task(s).`);
      }
    }

    // 2) Qdrant collection bootstrap (idempotent; points written by the worker).
    await ensureQdrantCollection(
      config.get('QDRANT_URL'),
      config.get('QDRANT_API_KEY'),
      config.get('QDRANT_COLLECTION'),
      config.get('GEMINI_EMBED_DIM'),
      logger,
    );

    logger.log('Migration / bootstrap complete.');
  } finally {
    await app.close();
  }
}

async function ensureQdrantCollection(
  baseUrl: string,
  apiKey: string | undefined,
  collection: string,
  embeddingDim: number,
  logger: Logger,
): Promise<void> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(apiKey ? { 'api-key': apiKey } : {}),
  };
  const url = `${baseUrl.replace(/\/$/, '')}/collections/${collection}`;

  try {
    const existing = await fetch(url, { headers });
    if (existing.ok) {
      logger.log(`Qdrant collection '${collection}' already exists.`);
      return;
    }
    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ vectors: { size: embeddingDim, distance: QDRANT_DISTANCE } }),
    });
    if (!res.ok) throw new Error(`create returned ${res.status}: ${await res.text()}`);
    logger.log(
      `Created Qdrant collection '${collection}' (dim=${embeddingDim}, ${QDRANT_DISTANCE}).`,
    );
  } catch (err) {
    // Non-fatal: RAG is not live until TASK-20, so a missing Qdrant must not
    // block API/worker deploys. The step logs loudly and continues.
    logger.warn(
      `Qdrant bootstrap skipped (${(err as Error).message}). Re-run once Qdrant is reachable.`,
    );
  }
}

void run().catch((err: unknown) => {
  new Logger('Migrate').error(err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
