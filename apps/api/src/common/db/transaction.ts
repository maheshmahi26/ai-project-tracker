import { Logger } from '@nestjs/common';
import type { ClientSession, Connection } from 'mongoose';

const logger = new Logger('Transaction');

let txnSupport: boolean | undefined;

/**
 * Multi-document transactions require a replica set / mongos. We probe support
 * once and cache it, so local standalone Mongo still works (the callback simply
 * runs without a session — sequential writes instead of an atomic commit).
 */
export async function supportsTransactions(connection: Connection): Promise<boolean> {
  if (txnSupport !== undefined) return txnSupport;
  try {
    const hello = await connection.db?.admin().command({ hello: 1 });
    txnSupport = Boolean(hello?.setName) || hello?.msg === 'isdbgrid';
  } catch {
    txnSupport = false;
  }
  if (!txnSupport) {
    logger.warn('MongoDB transactions unavailable (standalone); writes run without a session');
  }
  return txnSupport;
}

/**
 * Run `fn` inside a transaction when the server supports it, otherwise run it
 * directly with `session = undefined`. Callers must thread the session into every
 * write for the atomic guarantee to hold on a replica set.
 */
export async function runInTransaction<T>(
  connection: Connection,
  fn: (session?: ClientSession) => Promise<T>,
): Promise<T> {
  if (!(await supportsTransactions(connection))) {
    return fn(undefined);
  }
  const session = await connection.startSession();
  try {
    let result: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result!;
  } finally {
    await session.endSession();
  }
}
