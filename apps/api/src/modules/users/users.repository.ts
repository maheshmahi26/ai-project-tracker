import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, UpdateQuery } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';

export type UserLean = User & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };

const SECRET_FIELDS = '+passwordHash +refreshTokenHash +resetTokenHash +resetTokenExpiresAt';

/** Port — depend on this abstraction, not the Mongoose impl. */
export abstract class UsersRepository {
  abstract findById(id: string): Promise<UserLean | null>;
  abstract findByIds(ids: string[]): Promise<UserLean[]>;
  abstract findByIdWithSecrets(id: string): Promise<UserLean | null>;
  abstract findByEmail(email: string): Promise<UserLean | null>;
  abstract findByEmailWithSecrets(email: string): Promise<UserLean | null>;
  abstract findByGoogleId(googleId: string): Promise<UserLean | null>;
  abstract create(data: Partial<User>): Promise<UserLean>;
  abstract updateById(id: string, update: UpdateQuery<User>): Promise<UserLean | null>;
}

@Injectable()
export class MongoUsersRepository extends UsersRepository {
  constructor(@InjectModel(User.name) private readonly model: Model<UserDocument>) {
    super();
  }

  findById(id: string): Promise<UserLean | null> {
    if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
    return this.model.findById(id).lean<UserLean>().exec();
  }

  findByIds(ids: string[]): Promise<UserLean[]> {
    const valid = ids.filter((id) => Types.ObjectId.isValid(id));
    return this.model.find({ _id: { $in: valid } }).lean<UserLean[]>().exec();
  }

  findByIdWithSecrets(id: string): Promise<UserLean | null> {
    if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
    return this.model.findById(id).select(SECRET_FIELDS).lean<UserLean>().exec();
  }

  findByEmail(email: string): Promise<UserLean | null> {
    return this.model.findOne({ email: email.toLowerCase() }).lean<UserLean>().exec();
  }

  findByEmailWithSecrets(email: string): Promise<UserLean | null> {
    return this.model
      .findOne({ email: email.toLowerCase() })
      .select('+passwordHash +refreshTokenHash')
      .lean<UserLean>()
      .exec();
  }

  findByGoogleId(googleId: string): Promise<UserLean | null> {
    return this.model.findOne({ googleId }).lean<UserLean>().exec();
  }

  async create(data: Partial<User>): Promise<UserLean> {
    const doc = await this.model.create(data);
    return doc.toObject() as unknown as UserLean;
  }

  updateById(id: string, update: UpdateQuery<User>): Promise<UserLean | null> {
    if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
    return this.model.findByIdAndUpdate(id, update, { new: true }).lean<UserLean>().exec();
  }
}
