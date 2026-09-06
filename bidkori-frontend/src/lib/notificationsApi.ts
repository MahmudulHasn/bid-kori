import api from '@/lib/api';
import {
  buildNotificationReadApiPath,
  buildNotificationsListApiPath,
  buildNotificationsReadAllApiPath,
  type NotificationItem,
  type NotificationListResponse,
} from '@/lib/notifications';

export {
  NOTIFICATIONS_API_PATH,
  buildNotificationReadApiPath,
  buildNotificationsListApiPath,
  buildNotificationsReadAllApiPath,
} from '@/lib/notifications';

export async function fetchNotifications(
  page = 1,
): Promise<NotificationListResponse> {
  const { data } = await api.get<NotificationListResponse>(
    buildNotificationsListApiPath(page),
  );
  return data;
}

/** SWR-compatible fetcher for notification list URLs. */
export async function notificationsListFetcher(
  url: string,
): Promise<NotificationListResponse> {
  const { data } = await api.get<NotificationListResponse>(url);
  return data;
}

export async function markNotificationRead(
  id: number,
): Promise<NotificationItem> {
  const { data } = await api.post<NotificationItem>(
    buildNotificationReadApiPath(id),
  );
  return data;
}

export async function markAllNotificationsRead(): Promise<{ updated: number }> {
  const { data } = await api.post<{ updated: number }>(
    buildNotificationsReadAllApiPath(),
  );
  return data;
}
