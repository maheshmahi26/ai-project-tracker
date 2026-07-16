import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema';
import { UsersRepository, MongoUsersRepository } from './users.repository';
import { UsersService } from './users.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  providers: [UsersService, { provide: UsersRepository, useClass: MongoUsersRepository }],
  exports: [UsersService, UsersRepository, MongooseModule],
})
export class UsersModule {}
