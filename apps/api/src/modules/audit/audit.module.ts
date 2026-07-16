import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLog, AuditLogSchema } from './schemas/audit-log.schema';
import { AuditLogRepository, MongoAuditLogRepository } from './audit.repository';
import { AuditService } from './audit.service';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: AuditLog.name, schema: AuditLogSchema }])],
  providers: [
    AuditService,
    { provide: AuditLogRepository, useClass: MongoAuditLogRepository },
  ],
  exports: [AuditService],
})
export class AuditModule {}
