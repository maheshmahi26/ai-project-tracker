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

// Qdrant collection contract (checked in as code, created if missing).
const QDRANT_COLLECTION = 'ai_projectos_chunks';
const EMBEDDING_DIM = 768; // Gemini text-embedding-004
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

    // 2) Qdrant collection bootstrap (placeholder; populated in TASK-20).
    await ensureQdrantCollection(config.get('QDRANT_URL'), config.get('QDRANT_API_KEY'), logger);

    logger.log('Migration / bootstrap complete.');
  } finally {
    await app.close();
  }
}

async function ensureQdrantCollection(
  baseUrl: string,
  apiKey: string | undefined,
  logger: Logger,
): Promise<void> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(apiKey ? { 'api-key': apiKey } : {}),
  };
  const url = `${baseUrl.replace(/\/$/, '')}/collections/${QDRANT_COLLECTION}`;

  try {
    const existing = await fetch(url, { headers });
    if (existing.ok) {
      logger.log(`Qdrant collection '${QDRANT_COLLECTION}' already exists.`);
      return;
    }
    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ vectors: { size: EMBEDDING_DIM, distance: QDRANT_DISTANCE } }),
    });
    if (!res.ok) throw new Error(`create returned ${res.status}: ${await res.text()}`);
    logger.log(
      `Created Qdrant collection '${QDRANT_COLLECTION}' (dim=${EMBEDDING_DIM}, ${QDRANT_DISTANCE}).`,
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
