import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { MembershipsService } from './memberships.service';
import {
  MongoOrganizationsRepository,
  OrganizationsRepository,
} from './organizations.repository';
import { MembershipsRepository, MongoMembershipsRepository } from './memberships.repository';
import { Organization, OrganizationSchema } from './schemas/organization.schema';
import { Membership, MembershipSchema } from './schemas/membership.schema';
import { OrgGuard } from '../auth/guards/org.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: Organization.name, schema: OrganizationSchema },
      { name: Membership.name, schema: MembershipSchema },
    ]),
  ],
  controllers: [OrganizationsController],
  providers: [
    OrganizationsService,
    MembershipsService,
    OrgGuard,
    PermissionsGuard,
    { provide: OrganizationsRepository, useClass: MongoOrganizationsRepository },
    { provide: MembershipsRepository, useClass: MongoMembershipsRepository },
  ],
  exports: [MembershipsRepository, MembershipsService, OrganizationsService],
})
export class OrganizationsModule {}
