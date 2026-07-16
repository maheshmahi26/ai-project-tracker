import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  createLabelSchema,
  listLabelsQuerySchema,
  updateLabelSchema,
  type CreateLabelInput,
  type LabelDTO,
  type ListLabelsQuery,
  type UpdateLabelInput,
} from '@ai-projectos/shared';
import { getRequestId } from '../../common/request/request-context';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { PaginatedResult } from '../../common/pagination/pagination';
import type { RequestMeta } from '../auth/auth.service';
import { CurrentOrg } from '../auth/decorators/current-org.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import type { OrgContext } from '../auth/auth.types';
import { LabelsService } from './labels.service';

@ApiTags('labels')
@ApiHeader({ name: 'x-org-id', description: 'Active organization id', required: true })
@Controller('labels')
@UseGuards(TenantGuard, PermissionsGuard)
export class LabelsController {
  constructor(private readonly labels: LabelsService) {}

  @Get()
  @Permissions('read')
  @ApiOperation({ summary: 'List labels (org-wide + project-scoped)' })
  list(
    @Query(new ZodValidationPipe(listLabelsQuerySchema)) query: ListLabelsQuery,
    @CurrentOrg() org: OrgContext,
  ): Promise<PaginatedResult<LabelDTO>> {
    return this.labels.list(org.orgId, query);
  }

  @Post()
  @Permissions('project:update')
  @ApiOperation({ summary: 'Create a label' })
  create(
    @Body(new ZodValidationPipe(createLabelSchema)) body: CreateLabelInput,
    @CurrentOrg() org: OrgContext,
    @Req() req: Request,
  ): Promise<LabelDTO> {
    return this.labels.create(org.orgId, org.userId, body, meta(req));
  }

  @Patch(':id')
  @Permissions('project:update')
  @ApiOperation({ summary: 'Update a label' })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateLabelSchema)) body: UpdateLabelInput,
    @CurrentOrg() org: OrgContext,
    @Req() req: Request,
  ): Promise<LabelDTO> {
    return this.labels.update(org.orgId, org.userId, id, body, meta(req));
  }

  @Delete(':id')
  @Permissions('project:update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a label (detaches it from all tasks)' })
  async remove(
    @Param('id') id: string,
    @CurrentOrg() org: OrgContext,
    @Req() req: Request,
  ): Promise<{ success: true }> {
    await this.labels.remove(org.orgId, org.userId, id, meta(req));
    return { success: true };
  }
}

function meta(req: Request): RequestMeta {
  return {
    requestId: getRequestId(req),
    ip: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  };
}
