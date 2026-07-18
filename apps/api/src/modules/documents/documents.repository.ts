import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import type { DocumentStatus } from '@ai-projectos/shared';
import { DocEntity, DocumentDocument } from './schemas/document.schema';

export type DocumentLean = DocEntity & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export interface DocumentListParams {
  orgId: string;
  status?: DocumentStatus;
  projectId?: string;
  beforeId?: string;
  limit: number;
}

/** Partial fields the indexer worker updates as a document moves through states. */
export interface DocumentStatusUpdate {
  status: DocumentStatus;
  chunkCount?: number;
  error?: string | null;
}

export abstract class DocumentsRepository {
  abstract create(data: Partial<DocEntity>): Promise<DocumentLean>;
  abstract findById(orgId: string, id: string): Promise<DocumentLean | null>;
  abstract list(params: DocumentListParams): Promise<DocumentLean[]>;
  abstract updateStatus(
    orgId: string,
    id: string,
    update: DocumentStatusUpdate,
  ): Promise<DocumentLean | null>;
  abstract softDelete(orgId: string, id: string): Promise<boolean>;
}

@Injectable()
export class MongoDocumentsRepository extends DocumentsRepository {
  constructor(@InjectModel(DocEntity.name) private readonly model: Model<DocumentDocument>) {
    super();
  }

  async create(data: Partial<DocEntity>): Promise<DocumentLean> {
    const doc = await this.model.create(data);
    return doc.toObject() as unknown as DocumentLean;
  }

  findById(orgId: string, id: string): Promise<DocumentLean | null> {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(orgId)) return Promise.resolve(null);
    return this.model
      .findOne({ _id: id, orgId, isDeleted: { $ne: true } })
      .lean<DocumentLean>()
      .exec();
  }

  list(params: DocumentListParams): Promise<DocumentLean[]> {
    if (!Types.ObjectId.isValid(params.orgId)) return Promise.resolve([]);
    const filter: FilterQuery<DocumentDocument> = {
      orgId: new Types.ObjectId(params.orgId),
      isDeleted: { $ne: true },
    };
    if (params.status) filter.status = params.status;
    if (params.projectId && Types.ObjectId.isValid(params.projectId)) {
      filter.projectId = new Types.ObjectId(params.projectId);
    }
    if (params.beforeId && Types.ObjectId.isValid(params.beforeId)) {
      filter._id = { $lt: new Types.ObjectId(params.beforeId) };
    }
    return this.model
      .find(filter)
      .sort({ _id: -1 })
      .limit(params.limit + 1)
      .lean<DocumentLean[]>()
      .exec();
  }

  updateStatus(
    orgId: string,
    id: string,
    update: DocumentStatusUpdate,
  ): Promise<DocumentLean | null> {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(orgId)) return Promise.resolve(null);
    const $set: Record<string, unknown> = { status: update.status };
    if (update.chunkCount !== undefined) $set.chunkCount = update.chunkCount;
    if (update.error !== undefined) $set.error = update.error;
    return this.model
      .findOneAndUpdate({ _id: id, orgId }, { $set }, { new: true })
      .lean<DocumentLean>()
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
}
