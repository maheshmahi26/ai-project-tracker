import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AiExecution, AiExecutionDocument } from '../schemas/ai-execution.schema';

export type AiExecutionLean = AiExecution & {
  _id: Types.ObjectId;
  createdAt: Date;
};

export abstract class AiExecutionsRepository {
  abstract create(data: Partial<AiExecution>): Promise<AiExecutionLean>;
  abstract findById(orgId: string, id: string): Promise<AiExecutionLean | null>;
}

@Injectable()
export class MongoAiExecutionsRepository extends AiExecutionsRepository {
  constructor(@InjectModel(AiExecution.name) private readonly model: Model<AiExecutionDocument>) {
    super();
  }

  async create(data: Partial<AiExecution>): Promise<AiExecutionLean> {
    const doc = await this.model.create(data);
    return doc.toObject() as unknown as AiExecutionLean;
  }

  findById(orgId: string, id: string): Promise<AiExecutionLean | null> {
    if (!Types.ObjectId.isValid(orgId) || !Types.ObjectId.isValid(id)) {
      return Promise.resolve(null);
    }
    return this.model.findOne({ _id: id, orgId }).lean<AiExecutionLean>().exec();
  }
}
