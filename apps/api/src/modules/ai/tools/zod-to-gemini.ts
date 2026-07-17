import type { ZodTypeAny } from 'zod';

/**
 * Minimal JSON Schema (OpenAPI 3 subset) accepted by Gemini's
 * `FunctionDeclaration.parametersJsonSchema`.
 */
export interface JsonSchema {
  type?: string;
  description?: string;
  enum?: unknown[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  nullable?: boolean;
  format?: string;
}

interface ZodDefLike {
  typeName?: string;
  description?: string;
  value?: unknown;
  values?: unknown;
  type?: ZodTypeAny;
  innerType?: ZodTypeAny;
  schema?: ZodTypeAny;
  shape?: () => Record<string, ZodTypeAny>;
}

function defOf(schema: ZodTypeAny): ZodDefLike {
  return (schema as unknown as { _def: ZodDefLike })._def ?? {};
}

function isOptionalLike(schema: ZodTypeAny): boolean {
  const t = defOf(schema).typeName;
  return t === 'ZodOptional' || t === 'ZodDefault';
}

/**
 * Converts a Zod schema into a Gemini-compatible JSON Schema. Handles the shapes
 * our tool inputs use (objects, primitives, enums, literals, arrays, optional /
 * nullable / default / refined wrappers). Unknown nodes degrade to `string` so a
 * tool is never un-callable — a deliberate, safe fallback.
 */
export function zodToJsonSchema(schema: ZodTypeAny): JsonSchema {
  const def = defOf(schema);
  const decorate = (js: JsonSchema): JsonSchema =>
    def.description ? { ...js, description: def.description } : js;

  switch (def.typeName) {
    case 'ZodString':
      return decorate({ type: 'string' });
    case 'ZodNumber':
      return decorate({ type: 'number' });
    case 'ZodBoolean':
      return decorate({ type: 'boolean' });
    case 'ZodDate':
      return decorate({ type: 'string', format: 'date-time' });
    case 'ZodLiteral':
      return decorate({
        type: typeof def.value === 'number' ? 'number' : 'string',
        enum: [def.value],
      });
    case 'ZodEnum':
      return decorate({ type: 'string', enum: [...((def.values as unknown[]) ?? [])] });
    case 'ZodNativeEnum':
      return decorate({ type: 'string', enum: Object.values(def.values as object) });
    case 'ZodArray':
      return decorate({ type: 'array', items: zodToJsonSchema(def.type as ZodTypeAny) });
    case 'ZodNullable':
      return { ...zodToJsonSchema(def.innerType as ZodTypeAny), nullable: true };
    case 'ZodOptional':
    case 'ZodDefault':
      return zodToJsonSchema(def.innerType as ZodTypeAny);
    case 'ZodEffects':
      return zodToJsonSchema(def.schema as ZodTypeAny);
    case 'ZodObject': {
      const shape = def.shape?.() ?? {};
      const properties: Record<string, JsonSchema> = {};
      const required: string[] = [];
      for (const [key, child] of Object.entries(shape)) {
        properties[key] = zodToJsonSchema(child);
        if (!isOptionalLike(child)) required.push(key);
      }
      const js: JsonSchema = { type: 'object', properties };
      if (required.length) js.required = required;
      return decorate(js);
    }
    default:
      return decorate({ type: 'string' });
  }
}
