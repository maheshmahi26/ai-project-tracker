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
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  changeRoleSchema,
  createOrgSchema,
  inviteMemberSchema,
  updateOrgSchema,
  type ChangeRoleInput,
  type CreateOrgInput,
  type InviteMemberInput,
  type MembershipDTO,
  type OrganizationDTO,
  type UpdateOrgInput,
} from '@ai-projectos/shared';
import { getRequestId } from '../../common/request/request-context';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { RequestMeta } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { OrgGuard } from '../auth/guards/org.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { OrganizationsService } from './organizations.service';

@ApiTags('organizations')
@Controller('orgs')
export class OrganizationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create an organization (caller becomes admin)' })
  createOrg(
    @Body(new ZodValidationPipe(createOrgSchema)) body: CreateOrgInput,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<OrganizationDTO> {
    return this.orgs.createOrg(user.userId, body, this.meta(req));
  }

  @Get()
  @ApiOperation({ summary: 'List organizations the caller belongs to' })
  listMine(@CurrentUser() user: AuthenticatedUser): Promise<OrganizationDTO[]> {
    return this.orgs.listMine(user.userId);
  }

  @Get(':id')
  @UseGuards(OrgGuard)
  @ApiOperation({ summary: 'Get an organization by id' })
  getOrg(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrganizationDTO> {
    return this.orgs.getOrg(id, user.userId);
  }

  @Patch(':id')
  @UseGuards(OrgGuard, PermissionsGuard)
  @Permissions('manage:org')
  @ApiOperation({ summary: 'Update organization settings (admin)' })
  updateOrg(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateOrgSchema)) body: UpdateOrgInput,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<OrganizationDTO> {
    return this.orgs.updateOrg(id, user.userId, body, this.meta(req));
  }

  @Delete(':id')
  @UseGuards(OrgGuard, PermissionsGuard)
  @Permissions('manage:org')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete an organization (admin)' })
  async deleteOrg(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<{ success: true }> {
    await this.orgs.deleteOrg(id, user.userId, this.meta(req));
    return { success: true };
  }

  @Get(':id/members')
  @UseGuards(OrgGuard)
  @ApiOperation({ summary: 'List organization members' })
  listMembers(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MembershipDTO[]> {
    return this.orgs.listMembers(id, user.userId);
  }

  @Post(':id/members')
  @UseGuards(OrgGuard, PermissionsGuard)
  @Permissions('manage:users')
  @ApiOperation({ summary: 'Invite a member (admin)' })
  inviteMember(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(inviteMemberSchema)) body: InviteMemberInput,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<MembershipDTO> {
    return this.orgs.inviteMember(id, user.userId, body, this.meta(req));
  }

  @Patch(':id/members/:userId')
  @UseGuards(OrgGuard, PermissionsGuard)
  @Permissions('manage:users')
  @ApiOperation({ summary: "Change a member's role (admin)" })
  changeRole(
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @Body(new ZodValidationPipe(changeRoleSchema)) body: ChangeRoleInput,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<MembershipDTO> {
    return this.orgs.changeMemberRole(id, user.userId, targetUserId, body.role, this.meta(req));
  }

  @Delete(':id/members/:userId')
  @UseGuards(OrgGuard, PermissionsGuard)
  @Permissions('manage:users')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a member (admin)' })
  async removeMember(
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<{ success: true }> {
    await this.orgs.removeMember(id, user.userId, targetUserId, this.meta(req));
    return { success: true };
  }

  private meta(req: Request): RequestMeta {
    return {
      requestId: getRequestId(req),
      ip: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    };
  }
}
