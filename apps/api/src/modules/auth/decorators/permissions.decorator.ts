import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@ai-projectos/shared';

export const PERMISSIONS_KEY = 'auth:permissions';

/** Requires the caller's org role to grant ALL listed permissions. */
export const Permissions = (...permissions: Permission[]): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSIONS_KEY, permissions);
