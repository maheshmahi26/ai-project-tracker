import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Role } from '@ai-projectos/shared';
import { AppException } from '../../../common/errors/app-exception';
import type { AiTool, ToolContext } from './ai-tool';
import { ToolRegistry } from './tool-registry';

const ctx = (role: Role): ToolContext => ({
  principal: { userId: 'u1', orgId: 'o1', role },
  requestId: 'req-1',
});

const echoTool: AiTool = {
  name: 'echo',
  description: 'Echoes a message',
  requiredPermission: 'read',
  inputSchema: z.object({ msg: z.string() }),
  outputSchema: z.object({ echo: z.string() }),
  handler: async (input) => ({ echo: (input as { msg: string }).msg }),
};

describe('ToolRegistry', () => {
  it('prevents duplicate registration', () => {
    const r = new ToolRegistry();
    r.register(echoTool);
    expect(() => r.register(echoTool)).toThrow(/Duplicate/);
  });

  it('runs a valid, authorized call', async () => {
    const r = new ToolRegistry();
    r.register(echoTool);
    const res = await r.execute('echo', { msg: 'hi' }, ctx('viewer'));
    expect(res).toEqual({ ok: true, data: { echo: 'hi' } });
  });

  it('returns UNKNOWN_TOOL for a missing tool', async () => {
    const res = await new ToolRegistry().execute('nope', {}, ctx('admin'));
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe('UNKNOWN_TOOL');
  });

  it('enforces the required permission', async () => {
    const r = new ToolRegistry();
    r.register({ ...echoTool, name: 'del', requiredPermission: 'project:delete' });
    const res = await r.execute('del', { msg: 'x' }, ctx('viewer'));
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe('PERMISSION_DENIED');
  });

  it('validates arguments before running the handler', async () => {
    const r = new ToolRegistry();
    r.register(echoTool);
    const res = await r.execute('echo', { wrong: true }, ctx('viewer'));
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe('VALIDATION_ERROR');
    expect(res.error?.details).toBeDefined();
  });

  it('maps thrown AppExceptions to structured errors', async () => {
    const r = new ToolRegistry();
    r.register({
      ...echoTool,
      name: 'boom',
      inputSchema: z.object({}),
      handler: async () => {
        throw AppException.notFound('missing');
      },
    });
    const res = await r.execute('boom', {}, ctx('viewer'));
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe('NOT_FOUND');
  });

  it('rejects handler output that fails its schema', async () => {
    const r = new ToolRegistry();
    r.register({
      ...echoTool,
      name: 'bad',
      inputSchema: z.object({}),
      outputSchema: z.object({ n: z.number() }),
      handler: async () => ({ n: 'not-a-number' }),
    });
    const res = await r.execute('bad', {}, ctx('viewer'));
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe('OUTPUT_INVALID');
  });

  it('scopes declarations + introspection to the role', () => {
    const r = new ToolRegistry();
    r.register(echoTool);
    r.register({ ...echoTool, name: 'createProj', requiredPermission: 'project:create' });

    expect(r.functionDeclarations('viewer').map((d) => d.name)).toEqual(['echo']);
    expect(r.toInfo('manager').map((t) => t.name).sort()).toEqual(['createProj', 'echo']);
    expect(r.functionDeclarations('manager')[0]).toMatchObject({
      name: 'echo',
      parametersJsonSchema: { type: 'object' },
    });
  });
});
