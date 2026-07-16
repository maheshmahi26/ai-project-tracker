import type { FilterQuery, Model, UpdateQuery } from 'mongoose';

/**
 * Base document fields every tenant collection shares. See specs/03-database-schema.md.
 */
export interface BaseDocFields {
  orgId: string;
  isDeleted?: boolean;
  deletedAt?: Date | null;
}

/**
 * Generic repository establishing two invariants for tenant data:
 *  1. **Org scoping** — every query is filtered by the caller's `orgId`, so a
 *     missing filter can never leak another tenant's data.
 *  2. **Soft delete** — reads exclude `isDeleted` docs by default; delete flips
 *     the flag (enabling "undo delete"); restore flips it back.
 *
 * Feature repositories extend this and add their own query methods.
 */
export abstract class BaseRepository<T extends BaseDocFields> {
  protected constructor(protected readonly model: Model<T>) {}

  /** Build an org-scoped, soft-delete-aware filter. */
  protected scopedFilter(
    orgId: string,
    filter: FilterQuery<T> = {},
    includeDeleted = false,
  ): FilterQuery<T> {
    const base: Record<string, unknown> = { ...filter, orgId };
    if (!includeDeleted) base.isDeleted = { $ne: true };
    return base as FilterQuery<T>;
  }

  async findById(orgId: string, id: string, includeDeleted = false): Promise<T | null> {
    return this.model
      .findOne(this.scopedFilter(orgId, { _id: id } as FilterQuery<T>, includeDeleted))
      .lean<T>()
      .exec();
  }

  async findOne(orgId: string, filter: FilterQuery<T>): Promise<T | null> {
    return this.model.findOne(this.scopedFilter(orgId, filter)).lean<T>().exec();
  }

  async exists(orgId: string, filter: FilterQuery<T>): Promise<boolean> {
    const doc = await this.model.exists(this.scopedFilter(orgId, filter)).exec();
    return doc !== null;
  }

  async create(data: Partial<T>): Promise<T> {
    const created = await this.model.create(data as T);
    return created.toObject<T>();
  }

  async updateById(orgId: string, id: string, update: UpdateQuery<T>): Promise<T | null> {
    return this.model
      .findOneAndUpdate(this.scopedFilter(orgId, { _id: id } as FilterQuery<T>), update, {
        new: true,
      })
      .lean<T>()
      .exec();
  }

  /** Soft delete: mark deleted so it can be restored within the retention window. */
  async softDelete(orgId: string, id: string): Promise<boolean> {
    const res = await this.model
      .updateOne(this.scopedFilter(orgId, { _id: id } as FilterQuery<T>), {
        $set: { isDeleted: true, deletedAt: new Date() },
      })
      .exec();
    return res.modifiedCount > 0;
  }

  /** Undo a soft delete. */
  async restore(orgId: string, id: string): Promise<boolean> {
    const res = await this.model
      .updateOne(this.scopedFilter(orgId, { _id: id } as FilterQuery<T>, true), {
        $set: { isDeleted: false, deletedAt: null },
      })
      .exec();
    return res.modifiedCount > 0;
  }
}
