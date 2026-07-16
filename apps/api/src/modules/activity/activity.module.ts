import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ActivityLog, ActivityLogSchema } from './schemas/activity-log.schema';
import { ActivityLogRepository, MongoActivityLogRepository } from './activity.repository';
import { ActivityService } from './activity.service';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: ActivityLog.name, schema: ActivityLogSchema }])],
  providers: [
    ActivityService,
    { provide: ActivityLogRepository, useClass: MongoActivityLogRepository },
  ],
  exports: [ActivityService],
})
export class ActivityModule {}
