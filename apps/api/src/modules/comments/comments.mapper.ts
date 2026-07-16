import type { CommentDTO } from '@ai-projectos/shared';
import type { CommentLean } from './comments.repository';

export function toCommentDTO(c: CommentLean): CommentDTO {
  return {
    id: c._id.toString(),
    orgId: c.orgId.toString(),
    taskId: c.taskId.toString(),
    authorId: c.authorId.toString(),
    body: c.body,
    mentions: (c.mentions ?? []).map((m) => m.toString()),
    editedAt: c.editedAt ? c.editedAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}
