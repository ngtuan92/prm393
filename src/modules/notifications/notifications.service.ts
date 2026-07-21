import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { POSTGRES_POOL } from '../../database/database.constants';
import { CreateNotificationRequest } from '../../models/requests/create-notification.request';
import { NotificationsGateway } from './notifications.gateway';

type NotificationRow = {
  id: number;
  user_id: number;
  role: string;
  class_name: string | null;
  title: string;
  content: string;
  created_at: Date;
};

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(POSTGRES_POOL) private readonly pool: Pool,
    private readonly gateway: NotificationsGateway,
  ) {}

  async findForUser(userId: number, role: string): Promise<unknown[]> {
    await this.ensureNotificationTable();

    const result = await this.pool.query<NotificationRow>(
      `
        select id, user_id, role, class_name, title, content, created_at
        from app_notifications
        where user_id = $1
          and lower(role) = lower($2)
        order by created_at desc
      `,
      [userId, role],
    );

    return result.rows.map((row) => this.toResponse(row));
  }

  async create(payload: CreateNotificationRequest): Promise<unknown> {
    await this.ensureNotificationTable();

    const result = await this.pool.query<NotificationRow>(
      `
        insert into app_notifications (user_id, role, class_name, title, content)
        values ($1, $2, $3, $4, $5)
        returning id, user_id, role, class_name, title, content, created_at
      `,
      [
        payload.userId,
        payload.role,
        payload.className || 'Chung',
        payload.title,
        payload.content,
      ],
    );

    const notification = this.toResponse(result.rows[0]);
    this.gateway.emitNotification(payload.userId, payload.role, notification);
    return notification;
  }

  private async ensureNotificationTable(): Promise<void> {
    await this.pool.query(`
      create table if not exists app_notifications (
        id serial primary key,
        user_id integer not null,
        role varchar(30) not null,
        class_name varchar(100) null,
        title varchar(255) not null,
        content text not null,
        created_at timestamp without time zone not null default current_timestamp
      );

      create index if not exists idx_app_notifications_user_role
        on app_notifications(user_id, lower(role), created_at desc);
    `);
  }

  private toResponse(row: NotificationRow) {
    return {
      id: row.id,
      userId: row.user_id,
      role: row.role,
      title: row.title,
      content: row.content,
      className: row.class_name || 'Chung',
      createdAt: row.created_at,
    };
  }
}
