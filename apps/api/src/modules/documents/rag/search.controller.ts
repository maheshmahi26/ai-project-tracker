import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  semanticSearchSchema,
  type KnowledgeSearchResult,
  type SemanticSearchInput,
} from '@ai-projectos/shared';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { CurrentOrg } from '../../auth/decorators/current-org.decorator';
import { Permissions } from '../../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { TenantGuard } from '../../auth/guards/tenant.guard';
import type { OrgContext } from '../../auth/auth.types';
import { RagService } from './rag.service';

@ApiTags('search')
@ApiHeader({ name: 'x-org-id', description: 'Active organization id', required: true })
@Controller('search')
@UseGuards(TenantGuard, PermissionsGuard)
export class SearchController {
  constructor(private readonly rag: RagService) {}

  @Post('semantic')
  @Permissions('read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Semantic search over indexed documents (grounded chunks + citations)' })
  semantic(
    @Body(new ZodValidationPipe(semanticSearchSchema)) body: SemanticSearchInput,
    @CurrentOrg() org: OrgContext,
  ): Promise<KnowledgeSearchResult> {
    return this.rag.search(org.orgId, {
      query: body.query,
      projectId: body.projectId,
      limit: body.limit,
    });
  }
}
