import { Global, Module } from '@nestjs/common';
import { AppConfigModule } from '../../config/config.module';
import { GeminiClient, GoogleGeminiClient } from './gemini.client';

/**
 * Provides the Gemini LLM client app-wide. Global so any module (agent, RAG,
 * generative tools) can inject {@link GeminiClient} without re-importing.
 */
@Global()
@Module({
  imports: [AppConfigModule],
  providers: [{ provide: GeminiClient, useClass: GoogleGeminiClient }],
  exports: [GeminiClient],
})
export class AiInfraModule {}
