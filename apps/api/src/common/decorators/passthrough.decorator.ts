import { SetMetadata } from '@nestjs/common';

export const PASSTHROUGH_KEY = 'response:passthrough';

/**
 * Marks a route handler (or controller) so the {@link TransformInterceptor}
 * leaves its response untouched — e.g. streaming/SSE endpoints or raw payloads.
 */
export const Passthrough = (): MethodDecorator & ClassDecorator =>
  SetMetadata(PASSTHROUGH_KEY, true);
