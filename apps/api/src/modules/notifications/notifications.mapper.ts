import type { NotificationDTO } from '@ai-projectos/shared';
import type { NotificationLean } from './notifications.repository';

export function toNotificationDTO(n: NotificationLean): NotificationDTO {
  return {
    id: n._id.toString(),
    orgId: n.orgId.toString(),
    userId: n.userId.toString(),
    type: n.type,
    title: n.title,
    body: n.body ?? null,
    entity: n.entity ?? null,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  };
}
