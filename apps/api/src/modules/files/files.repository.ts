import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FileAsset, FileDocument } from './schemas/file.schema';

export type FileLean = FileAsset & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export abstract class FilesRepository {
  abstract findById(orgId: string, id: string): Promise<FileLean | null>;
  abstract create(data: Partial<FileAsset>): Promise<FileLean>;
  abstract softDelete(orgId: string, id: string): Promise<boolean>;
}

@Injectable()
export class MongoFilesRepository extends FilesRepository {
  constructor(@InjectModel(FileAsset.name) private readonly model: Model<FileDocument>) {
    super();
  }

  findById(orgId: string, id: string): Promise<FileLean | null> {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(orgId)) return Promise.resolve(null);
    return this.model.findOne({ _id: id, orgId, isDeleted: { $ne: true } }).lean<FileLean>().exec();
  }

  async create(data: Partial<FileAsset>): Promise<FileLean> {
    const doc = await this.model.create(data);
    return doc.toObject() as unknown as FileLean;
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
}
