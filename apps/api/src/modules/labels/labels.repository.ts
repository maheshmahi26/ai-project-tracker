import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types, UpdateQuery } from 'mongoose';
import { Label, LabelDocument } from './schemas/label.schema';

export type LabelLean = Label & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export interface LabelListParams {
  orgId: string;
  /** When set, returns project-scoped labels for this project plus org-wide labels. */
  projectId?: string;
  beforeId?: string;
  limit: number;
}

export abstract class LabelsRepository {
  abstract findById(orgId: string, id: string): Promise<LabelLean | null>;
  abstract create(data: Partial<Label>): Promise<LabelLean>;
  abstract updateById(orgId: string, id: string, update: UpdateQuery<Label>): Promise<LabelLean | null>;
  abstract deleteById(orgId: string, id: string): Promise<boolean>;
  abstract list(params: LabelListParams): Promise<LabelLean[]>;
}

@Injectable()
export class MongoLabelsRepository extends LabelsRepository {
  constructor(@InjectModel(Label.name) private readonly model: Model<LabelDocument>) {
    super();
  }

  findById(orgId: string, id: string): Promise<LabelLean | null> {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(orgId)) return Promise.resolve(null);
    return this.model.findOne({ _id: id, orgId }).lean<LabelLean>().exec();
  }

  async create(data: Partial<Label>): Promise<LabelLean> {
    const doc = await this.model.create(data);
    return doc.toObject() as unknown as LabelLean;
  }

  updateById(orgId: string, id: string, update: UpdateQuery<Label>): Promise<LabelLean | null> {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(orgId)) return Promise.resolve(null);
    return this.model.findOneAndUpdate({ _id: id, orgId }, update, { new: true }).lean<LabelLean>().exec();
  }

  async deleteById(orgId: string, id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(orgId)) return false;
    const res = await this.model.deleteOne({ _id: id, orgId }).exec();
    return res.deletedCount > 0;
  }

  list(params: LabelListParams): Promise<LabelLean[]> {
    if (!Types.ObjectId.isValid(params.orgId)) return Promise.resolve([]);
    const filter: FilterQuery<LabelDocument> = { orgId: new Types.ObjectId(params.orgId) };
    if (params.projectId && Types.ObjectId.isValid(params.projectId)) {
      filter.$or = [{ projectId: new Types.ObjectId(params.projectId) }, { projectId: null }];
    }
    if (params.beforeId && Types.ObjectId.isValid(params.beforeId)) {
      filter._id = { $lt: new Types.ObjectId(params.beforeId) };
    }
    return this.model
      .find(filter)
      .sort({ _id: -1 })
      .limit(params.limit + 1)
      .lean<LabelLean[]>()
      .exec();
  }
}
