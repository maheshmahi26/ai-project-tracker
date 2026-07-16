import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrganizationsModule } from '../organizations/organizations.module';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsListener } from './notifications.listener';
import {
  MongoNotificationsRepository,
  NotificationsRepository,
} from './notifications.repository';
import { Notification, NotificationSchema } from './schemas/notification.schema';

@Module({
  imports: [
    OrganizationsModule,
    UsersModule,
    MailModule,
    MongooseModule.forFeature([{ name: Notification.name, schema: NotificationSchema }]),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsListener,
    { provide: NotificationsRepository, useClass: MongoNotificationsRepository },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
