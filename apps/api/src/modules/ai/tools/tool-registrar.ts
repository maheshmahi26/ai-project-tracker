import { Inject, Injectable, OnModuleInit, Optional } from '@nestjs/common';
import type { AiTool } from './ai-tool';
import { ToolRegistry } from './tool-registry';

/** DI token for the (multi-provided) set of tools to load into the registry. */
export const AI_TOOLS = Symbol('AI_TOOLS');

/**
 * Registers every provided {@link AiTool} into the {@link ToolRegistry} on boot.
 * New tools just add another `AI_TOOLS` multi-provider — no central edit needed.
 */
@Injectable()
export class ToolRegistrar implements OnModuleInit {
  constructor(
    private readonly registry: ToolRegistry,
    @Optional() @Inject(AI_TOOLS) private readonly tools: AiTool[] = [],
  ) {}

  onModuleInit(): void {
    for (const tool of this.tools ?? []) {
      this.registry.register(tool);
    }
  }
}
