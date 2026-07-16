import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrganizationsModule } from '../organizations/organizations.module';
import { TasksModule } from '../tasks/tasks.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { MongoCommentsRepository, CommentsRepository } from './comments.repository';
import { Comment, CommentSchema } from './schemas/comment.schema';

@Module({
  imports: [
    OrganizationsModule,
    TasksModule,
    NotificationsModule,
    MongooseModule.forFeature([{ name: Comment.name, schema: CommentSchema }]),
  ],
  controllers: [CommentsController],
  providers: [CommentsService, { provide: CommentsRepository, useClass: MongoCommentsRepository }],
  exports: [CommentsService],
})
export class CommentsModule {}
