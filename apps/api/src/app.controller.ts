import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { APP_NAME } from '@ai-projectos/shared';
import { AppConfigService } from './config/config.module';
import { AppException } from './common/errors/app-exception';
import { ZodValidationPipe } from './common/pipes/zod-validation.pipe';

const echoSchema = z.object({
  name: z.string().min(1),
  count: z.coerce.number().int().positive(),
});
type EchoDto = z.infer<typeof echoSchema>;

@ApiTags('app')
@Controller()
export class AppController {
  constructor(private readonly config: AppConfigService) {}

  @Get('ping')
  @ApiOperation({ summary: 'Liveness ping (wrapped in the success envelope)' })
  ping(): { name: string; env: string; message: string } {
    return { name: APP_NAME, env: this.config.get('NODE_ENV'), message: 'pong' };
  }

  // --- Debug endpoints: demonstrate the error envelope + validation pipe. ---

  @Get('debug/error')
  @ApiOperation({ summary: 'Throws an unexpected error → INTERNAL 500 envelope' })
  boom(): never {
    throw new Error('Intentional debug error');
  }

  @Get('debug/app-error')
  @ApiOperation({ summary: 'Throws a domain error → BUSINESS_RULE 422 envelope' })
  appError(): never {
    throw AppException.businessRule('This is a sample business-rule violation');
  }

  @Post('debug/validate')
  @ApiOperation({ summary: 'Validates the body → VALIDATION_ERROR on failure' })
  validate(@Body(new ZodValidationPipe(echoSchema)) body: EchoDto): EchoDto {
    return body;
  }
}
