import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types, UpdateQuery } from 'mongoose';
import { Comment, CommentDocument } from './schemas/comment.schema';

export type CommentLean = Comment & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export interface CommentListParams {
  orgId: string;
  taskId: string;
  beforeId?: string;
  limit: number;
}

export abstract class CommentsRepository {
  abstract findById(orgId: string, id: string): Promise<CommentLean | null>;
  abstract create(data: Partial<Comment>): Promise<CommentLean>;
  abstract updateById(orgId: string, id: string, update: UpdateQuery<Comment>): Promise<CommentLean | null>;
  abstract softDelete(orgId: string, id: string): Promise<boolean>;
  abstract listByTask(params: CommentListParams): Promise<CommentLean[]>;
}

@Injectable()
export class MongoCommentsRepository extends CommentsRepository {
  constructor(@InjectModel(Comment.name) private readonly model: Model<CommentDocument>) {
    super();
  }

  findById(orgId: string, id: string): Promise<CommentLean | null> {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(orgId)) return Promise.resolve(null);
    return this.model.findOne({ _id: id, orgId, isDeleted: { $ne: true } }).lean<CommentLean>().exec();
  }

  async create(data: Partial<Comment>): Promise<CommentLean> {
    const doc = await this.model.create(data);
    return doc.toObject() as unknown as CommentLean;
  }

  updateById(orgId: string, id: string, update: UpdateQuery<Comment>): Promise<CommentLean | null> {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(orgId)) return Promise.resolve(null);
    return this.model
      .findOneAndUpdate({ _id: id, orgId, isDeleted: { $ne: true } }, update, { new: true })
      .lean<CommentLean>()
      .exec();
  }

  async softDelete(orgId: string, id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(orgId)) return false;
    const res = await this.model
      .updateOne(
        { _id: id, orgId, isDeleted: { $ne: true } },
        { $set: { isDeleted: true, deletedAt: new Date() } },
      )
      .exec();
    return res.modifiedCount > 0;
  }

  listByTask(params: CommentListParams): Promise<CommentLean[]> {
    if (!Types.ObjectId.isValid(params.orgId) || !Types.ObjectId.isValid(params.taskId)) {
      return Promise.resolve([]);
    }
    const filter: FilterQuery<CommentDocument> = {
      orgId: new Types.ObjectId(params.orgId),
      taskId: new Types.ObjectId(params.taskId),
      isDeleted: { $ne: true },
    };
    if (params.beforeId && Types.ObjectId.isValid(params.beforeId)) {
      filter._id = { $lt: new Types.ObjectId(params.beforeId) };
    }
    return this.model
      .find(filter)
      .sort({ _id: -1 })
      .limit(params.limit + 1)
      .lean<CommentLean[]>()
      .exec();
  }
}
