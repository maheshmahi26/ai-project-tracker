import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  confirmFileSchema,
  presignFileSchema,
  type ConfirmFileInput,
  type FileDTO,
  type PresignFileInput,
  type PresignFileResult,
} from '@ai-projectos/shared';
import { getRequestId } from '../../common/request/request-context';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { RequestMeta } from '../auth/auth.service';
import { CurrentOrg } from '../auth/decorators/current-org.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import type { OrgContext } from '../auth/auth.types';
import { FilesService } from './files.service';

@ApiTags('files')
@ApiHeader({ name: 'x-org-id', description: 'Active organization id', required: true })
@Controller('files')
@UseGuards(TenantGuard, PermissionsGuard)
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('presign')
  @Permissions('task:update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a presigned upload URL' })
  presign(
    @Body(new ZodValidationPipe(presignFileSchema)) body: PresignFileInput,
    @CurrentOrg() org: OrgContext,
  ): Promise<PresignFileResult> {
    return this.files.presign(org.orgId, body);
  }

  @Post()
  @Permissions('task:update')
  @ApiOperation({ summary: 'Confirm an uploaded file (persist metadata)' })
  confirm(
    @Body(new ZodValidationPipe(confirmFileSchema)) body: ConfirmFileInput,
    @CurrentOrg() org: OrgContext,
    @Req() req: Request,
  ): Promise<FileDTO> {
    return this.files.confirm(org.orgId, org.userId, body, meta(req));
  }

  @Get(':id/download')
  @Permissions('read')
  @ApiOperation({ summary: 'Get a presigned download URL' })
  download(
    @Param('id') id: string,
    @CurrentOrg() org: OrgContext,
  ): Promise<{ url: string; expiresInSec: number }> {
    return this.files.download(org.orgId, id);
  }

  @Delete(':id')
  @Permissions('task:update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a file' })
  async remove(
    @Param('id') id: string,
    @CurrentOrg() org: OrgContext,
    @Req() req: Request,
  ): Promise<{ success: true }> {
    await this.files.remove(org.orgId, org.userId, id, meta(req));
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
