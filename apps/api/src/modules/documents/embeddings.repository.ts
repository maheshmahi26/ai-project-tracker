import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Embedding, EmbeddingDocument } from './schemas/embedding.schema';

export type EmbeddingLean = Embedding & { _id: Types.ObjectId; createdAt: Date };

export abstract class EmbeddingsRepository {
  abstract insertMany(rows: Partial<Embedding>[]): Promise<void>;
  abstract deleteByDocument(orgId: string, documentId: string): Promise<number>;
  abstract findByPointIds(orgId: string, pointIds: string[]): Promise<EmbeddingLean[]>;
  abstract countByDocument(orgId: string, documentId: string): Promise<number>;
  /** Ordered chunks of one document (chunkIndex asc) — used to build a doc-wide prompt context. */
  abstract listByDocument(orgId: string, documentId: string, limit: number): Promise<EmbeddingLean[]>;
}

@Injectable()
export class MongoEmbeddingsRepository extends EmbeddingsRepository {
  constructor(@InjectModel(Embedding.name) private readonly model: Model<EmbeddingDocument>) {
    super();
  }

  async insertMany(rows: Partial<Embedding>[]): Promise<void> {
    if (rows.length === 0) return;
    await this.model.insertMany(rows);
  }

  async deleteByDocument(orgId: string, documentId: string): Promise<number> {
    if (!Types.ObjectId.isValid(orgId) || !Types.ObjectId.isValid(documentId)) return 0;
    const res = await this.model
      .deleteMany({
        orgId: new Types.ObjectId(orgId),
        documentId: new Types.ObjectId(documentId),
      })
      .exec();
    return res.deletedCount ?? 0;
  }

  findByPointIds(orgId: string, pointIds: string[]): Promise<EmbeddingLean[]> {
    if (!Types.ObjectId.isValid(orgId) || pointIds.length === 0) return Promise.resolve([]);
    return this.model
      .find({ orgId: new Types.ObjectId(orgId), qdrantPointId: { $in: pointIds } })
      .lean<EmbeddingLean[]>()
      .exec();
  }

  countByDocument(orgId: string, documentId: string): Promise<number> {
    if (!Types.ObjectId.isValid(orgId) || !Types.ObjectId.isValid(documentId)) {
      return Promise.resolve(0);
    }
    return this.model
      .countDocuments({
        orgId: new Types.ObjectId(orgId),
        documentId: new Types.ObjectId(documentId),
      })
      .exec();
  }

  listByDocument(orgId: string, documentId: string, limit: number): Promise<EmbeddingLean[]> {
    if (!Types.ObjectId.isValid(orgId) || !Types.ObjectId.isValid(documentId)) {
      return Promise.resolve([]);
    }
    return this.model
      .find({ orgId: new Types.ObjectId(orgId), documentId: new Types.ObjectId(documentId) })
      .sort({ chunkIndex: 1 })
      .limit(limit)
      .lean<EmbeddingLean[]>()
      .exec();
  }
}
