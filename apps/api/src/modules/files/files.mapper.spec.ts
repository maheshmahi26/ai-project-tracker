import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { FILE_MAX_BYTES, isAllowedMimeType } from '@ai-projectos/shared';
import { toFileDTO } from './files.mapper';
import type { FileLean } from './files.repository';

describe('file mime allowlist', () => {
  it('accepts images by prefix and known document types', () => {
    expect(isAllowedMimeType('image/png')).toBe(true);
    expect(isAllowedMimeType('image/anything')).toBe(true);
    expect(isAllowedMimeType('application/pdf')).toBe(true);
    expect(isAllowedMimeType('text/csv')).toBe(true);
  });

  it('rejects unknown / dangerous types', () => {
    expect(isAllowedMimeType('application/x-msdownload')).toBe(false);
    expect(isAllowedMimeType('application/octet-stream')).toBe(false);
    expect(isAllowedMimeType('video/mp4')).toBe(false);
  });

  it('caps size at 25MB', () => {
    expect(FILE_MAX_BYTES).toBe(25 * 1024 * 1024);
  });
});

describe('toFileDTO', () => {
  it('maps ObjectIds to strings and preserves scope', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const lean: FileLean = {
      _id: new Types.ObjectId(),
      orgId: new Types.ObjectId(),
      uploaderId: new Types.ObjectId(),
      scope: { type: 'task', id: '64b7f0000000000000000000' },
      fileName: 'a.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10,
      storageKey: 'orgs/x/task/y/z-a.pdf',
      isDeleted: false,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const dto = toFileDTO(lean);
    expect(dto.id).toBe(lean._id.toString());
    expect(dto.scope).toEqual({ type: 'task', id: '64b7f0000000000000000000' });
    expect(dto.createdAt).toBe(now.toISOString());
  });
});
