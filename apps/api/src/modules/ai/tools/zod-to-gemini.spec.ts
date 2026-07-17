import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { zodToJsonSchema } from './zod-to-gemini';

describe('zodToJsonSchema', () => {
  it('converts an object with primitives + required tracking', () => {
    const schema = z.object({
      title: z.string().describe('The title'),
      count: z.number(),
      done: z.boolean().optional(),
    });
    expect(zodToJsonSchema(schema)).toEqual({
      type: 'object',
      properties: {
        title: { type: 'string', description: 'The title' },
        count: { type: 'number' },
        done: { type: 'boolean' },
      },
      required: ['title', 'count'],
    });
  });

  it('treats default-wrapped fields as optional', () => {
    const schema = z.object({ limit: z.number().default(25) });
    const js = zodToJsonSchema(schema);
    expect(js.required).toBeUndefined();
  });

  it('handles enums, arrays, literals and nullable', () => {
    expect(zodToJsonSchema(z.enum(['a', 'b']))).toEqual({ type: 'string', enum: ['a', 'b'] });
    expect(zodToJsonSchema(z.array(z.string()))).toEqual({ type: 'array', items: { type: 'string' } });
    expect(zodToJsonSchema(z.literal('x'))).toEqual({ type: 'string', enum: ['x'] });
    expect(zodToJsonSchema(z.string().nullable())).toEqual({ type: 'string', nullable: true });
  });

  it('unwraps refinements (ZodEffects)', () => {
    const schema = z.object({ n: z.number() }).refine(() => true);
    expect(zodToJsonSchema(schema)).toMatchObject({ type: 'object' });
  });
});
