import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  confirmDocumentSchema,
  listDocumentsQuerySchema,
  presignDocumentSchema,
  type ConfirmDocumentInput,
  type DocumentDTO,
  type ListDocumentsQuery,
  type PresignDocumentInput,
  type PresignFileResult,
} from '@ai-projectos/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { PaginatedResult } from '../../common/pagination/pagination';
import { CurrentOrg } from '../auth/decorators/current-org.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import type { OrgContext } from '../auth/auth.types';
import { DocumentsService } from './documents.service';

@ApiTags('documents')
@ApiHeader({ name: 'x-org-id', description: 'Active organization id', required: true })
@Controller('documents')
@UseGuards(TenantGuard, PermissionsGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @Permissions('read')
  @ApiOperation({ summary: 'List RAG documents (newest first)' })
  list(
    @Query(new ZodValidationPipe(listDocumentsQuerySchema)) query: ListDocumentsQuery,
    @CurrentOrg() org: OrgContext,
  ): Promise<PaginatedResult<DocumentDTO>> {
    return this.documents.list(org.orgId, query);
  }

  @Post('presign')
  @Permissions('document:create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a presigned upload URL for a document' })
  presign(
    @Body(new ZodValidationPipe(presignDocumentSchema)) body: PresignDocumentInput,
    @CurrentOrg() org: OrgContext,
  ): Promise<PresignFileResult> {
    return this.documents.presign(org.orgId, body);
  }

  @Post()
  @Permissions('document:create')
  @ApiOperation({ summary: 'Confirm an uploaded document and enqueue indexing' })
  confirm(
    @Body(new ZodValidationPipe(confirmDocumentSchema)) body: ConfirmDocumentInput,
    @CurrentOrg() org: OrgContext,
  ): Promise<DocumentDTO> {
    return this.documents.confirm(org.orgId, org.userId, body);
  }

  @Get(':id')
  @Permissions('read')
  @ApiOperation({ summary: 'Get a document (poll ingestion status)' })
  get(@Param('id') id: string, @CurrentOrg() org: OrgContext): Promise<DocumentDTO> {
    return this.documents.get(org.orgId, id);
  }

  @Delete(':id')
  @Permissions('document:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a document (removes its vectors + chunks)' })
  async remove(
    @Param('id') id: string,
    @CurrentOrg() org: OrgContext,
  ): Promise<{ success: true }> {
    await this.documents.remove(org.orgId, id);
    return { success: true };
  }
}
