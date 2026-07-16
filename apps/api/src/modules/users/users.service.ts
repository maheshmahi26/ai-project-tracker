import { Injectable } from '@nestjs/common';
import type { PublicUser } from '@ai-projectos/shared';
import { AppException } from '../../common/errors/app-exception';
import { UsersRepository, type UserLean } from './users.repository';
import { toPublicUser } from './user.mapper';

@Injectable()
export class UsersService {
  constructor(private readonly users: UsersRepository) {}

  findById(id: string): Promise<UserLean | null> {
    return this.users.findById(id);
  }

  async getPublicByIdOrThrow(id: string): Promise<PublicUser> {
    const user = await this.users.findById(id);
    if (!user) throw AppException.notFound('User not found');
    return toPublicUser(user);
  }
}
