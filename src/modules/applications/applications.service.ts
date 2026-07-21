import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { POSTGRES_POOL } from '../../database/database.constants';
import { UserRole } from '../../models/enums/user-role.enum';
import { CreateApplicationRequest } from '../../models/requests/create-application.request';
import { NotificationsService } from '../notifications/notifications.service';

type ApplicationRow = {
  id: number;
  user_id: number;
  role: UserRole;
  actor_profile_id: number | null;
  title: string;
  type: string;
  content: string;
  status: string;
  receiver_name: string | null;
  created_at: string;
  updated_at: string;
};

@Injectable()
export class ApplicationsService {
  private static readonly parentLeaveType = 'LeaveAbsence';
  private static readonly parentLeaveAutoApproveMs = 5 * 60 * 1000;
  private schemaReady = false;
  private schemaPromise: Promise<void> | null = null;

  constructor(
    @Inject(POSTGRES_POOL) private readonly pool: Pool,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findByUser(userId: number): Promise<ApplicationRow[]> {
    await this.ensureApplicationsSchema();
    await this.approveExpiredParentLeaveRequests();

    const result = await this.pool.query<ApplicationRow>(
      `
        select id, user_id, role, actor_profile_id, title, type, content,
               status, receiver_name, created_at, updated_at
        from requests
        where user_id = $1
        order by created_at desc, id desc
      `,
      [userId],
    );

    return result.rows;
  }

  async create(payload: CreateApplicationRequest): Promise<ApplicationRow> {
    await this.ensureApplicationsSchema();

    const actor = await this.findActorProfile(payload.userId, payload.role);
    if (!actor) {
      throw new BadRequestException('User role profile does not exist');
    }

    const receiverTeacher = await this.resolveReceiverTeacher(payload);
    const result = await this.pool.query<ApplicationRow>(
      `
        insert into requests (
          user_id, role, actor_profile_id, title, type, content,
          status, receiver_name, created_at, updated_at
        )
        values ($1, $2, $3, $4, $5, $6, 'Pending', $7, now(), now())
        returning id, user_id, role, actor_profile_id, title, type, content,
                  status, receiver_name, created_at, updated_at
      `,
      [
        payload.userId,
        payload.role,
        actor.profileId,
        payload.title,
        payload.type,
        payload.content,
        payload.receiverName ?? 'Phòng Dịch vụ Sinh viên',
      ],
    );

    const application = result.rows[0];
    if (this.isParentLeaveRequest(payload)) {
      await this.notifyTeacherAboutParentLeave(application, receiverTeacher);
      this.scheduleParentLeaveAutoApproval(application.id);
    }

    return application;
  }

  async findAll(): Promise<(ApplicationRow & { sender_name: string })[]> {
    await this.ensureApplicationsSchema();
    await this.approveExpiredParentLeaveRequests();

    const result = await this.pool.query<
      ApplicationRow & { sender_name: string }
    >(
      `
        select r.id, r.user_id, r.role, r.actor_profile_id, r.title, r.type, r.content,
               r.status, r.receiver_name, r.created_at, r.updated_at,
               coalesce(s.full_name, t.full_name, p.full_name, u.email) as sender_name
        from requests r
        left join users u on r.user_id = u.id
        left join students s on r.user_id = s.user_id and r.role = 'STUDENT'
        left join teachers t on r.user_id = t.user_id and r.role = 'TEACHER'
        left join parents p on r.user_id = p.user_id and r.role = 'PARENT'
        order by r.created_at desc, r.id desc
      `,
    );

    return result.rows;
  }

  async updateStatus(id: number, status: string): Promise<ApplicationRow> {
    await this.ensureApplicationsSchema();

    const result = await this.pool.query<ApplicationRow>(
      `
        update requests
        set status = $1, updated_at = now()
        where id = $2
        returning id, user_id, role, actor_profile_id, title, type, content,
                  status, receiver_name, created_at, updated_at
      `,
      [status, id],
    );

    if (result.rowCount === 0) {
      throw new BadRequestException('Application request not found');
    }

    return result.rows[0];
  }

  private isParentLeaveRequest(payload: CreateApplicationRequest): boolean {
    return (
      payload.role === UserRole.Parent &&
      payload.type === ApplicationsService.parentLeaveType
    );
  }

  private async resolveReceiverTeacher(payload: CreateApplicationRequest) {
    if (!this.isParentLeaveRequest(payload)) {
      return null;
    }

    if (payload.receiverTeacherId) {
      const byId = await this.pool.query<{
        teacher_id: number;
        user_id: number;
        full_name: string;
      }>(
        `
          select teacher_id, user_id, full_name
          from teachers
          where teacher_id = $1
          limit 1
        `,
        [payload.receiverTeacherId],
      );
      if (byId.rows[0]) return byId.rows[0];
    }

    const byStudent = await this.pool.query<{
      teacher_id: number;
      user_id: number;
      full_name: string;
    }>(
      `
        select t.teacher_id, t.user_id, t.full_name
        from teachers t
        join (
          select distinct class_name
          from student_attendances
          where student_id = $1
          limit 1
        ) sc on sc.class_name = t.homeroom_class
        limit 1
      `,
      [payload.studentCode ?? ''],
    );

    return byStudent.rows[0] ?? null;
  }

  private async notifyTeacherAboutParentLeave(
    application: ApplicationRow,
    teacher: { user_id: number } | null,
  ): Promise<void> {
    if (!teacher?.user_id) return;

    await this.notificationsService.create({
      userId: teacher.user_id,
      role: UserRole.Teacher,
      title: 'Phụ huynh gửi đơn xin nghỉ học',
      content:
        `${application.title}. Đơn sẽ tự động được duyệt sau 5 phút ` +
        `nếu giáo viên không xử lý trước.`,
      className: 'Đơn xin nghỉ',
    });
  }

  private scheduleParentLeaveAutoApproval(applicationId: number): void {
    setTimeout(() => {
      void this.autoApproveParentLeaveRequest(applicationId);
    }, ApplicationsService.parentLeaveAutoApproveMs).unref?.();
  }

  private async autoApproveParentLeaveRequest(
    applicationId: number,
  ): Promise<void> {
    await this.ensureApplicationsSchema();
    await this.pool.query(
      `
        update requests
        set status = 'Approved', updated_at = now()
        where id = $1
          and role = $2
          and type = $3
          and status = 'Pending'
      `,
      [applicationId, UserRole.Parent, ApplicationsService.parentLeaveType],
    );
  }

  private async approveExpiredParentLeaveRequests(): Promise<void> {
    await this.pool.query(
      `
        update requests
        set status = 'Approved', updated_at = now()
        where role = $1
          and type = $2
          and status = 'Pending'
          and created_at <= now() - interval '5 minutes'
      `,
      [UserRole.Parent, ApplicationsService.parentLeaveType],
    );
  }

  private async findActorProfile(userId: number, role: UserRole) {
    const tableByRole = {
      [UserRole.Student]: { table: 'students', id: 'id' },
      [UserRole.Teacher]: { table: 'teachers', id: 'teacher_id' },
      [UserRole.Parent]: { table: 'parents', id: 'parent_id' },
      [UserRole.Staff]: { table: 'users', id: 'id' },
    }[role];

    const result = await this.pool.query<{ profile_id: number }>(
      `
        select ${tableByRole.id} as profile_id
        from ${tableByRole.table}
        where user_id = $1
        limit 1
      `,
      [userId],
    );

    const profile = result.rows[0];
    return profile ? { profileId: profile.profile_id } : null;
  }

  private async ensureApplicationsSchema(): Promise<void> {
    if (this.schemaReady) {
      return;
    }

    if (this.schemaPromise) {
      await this.schemaPromise;
      return;
    }

    this.schemaPromise = this.createApplicationsSchema();
    try {
      await this.schemaPromise;
      this.schemaReady = true;
    } finally {
      this.schemaPromise = null;
    }
  }

  private async createApplicationsSchema(): Promise<void> {
    await this.pool.query(`
      create table if not exists requests (
        id serial primary key,
        title varchar(255) not null,
        type varchar(80) not null,
        content text not null,
        status varchar(30) not null default 'Pending'
      );

      alter table requests add column if not exists user_id integer null;
      alter table requests add column if not exists role varchar(30) null;
      alter table requests add column if not exists actor_profile_id integer null;
      alter table requests add column if not exists receiver_name varchar(255) null;
      alter table requests add column if not exists created_at timestamp without time zone null default current_timestamp;
      alter table requests add column if not exists updated_at timestamp without time zone null default current_timestamp;
    `);

    if (await this.hasColumn('requests', 'student_id')) {
      await this.pool.query(`
      update requests r
      set user_id = s.user_id,
          role = '${UserRole.Student}',
          actor_profile_id = s.id,
          receiver_name = coalesce(r.receiver_name, 'Phòng Dịch vụ Sinh viên'),
          created_at = coalesce(r.created_at, current_timestamp),
          updated_at = coalesce(r.updated_at, current_timestamp)
      from students s
      where r.user_id is null
        and r.student_id = s.id;
      `);
    }

    await this.pool.query(`
      update requests
      set status = coalesce(status, 'Pending'),
          receiver_name = coalesce(receiver_name, 'Phòng Dịch vụ Sinh viên'),
          created_at = coalesce(created_at, current_timestamp),
          updated_at = coalesce(updated_at, current_timestamp);

      create index if not exists idx_requests_user_id on requests(user_id);
      create index if not exists idx_requests_role on requests(role);
    `);
  }

  private async hasColumn(
    tableName: string,
    columnName: string,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = $1
          and column_name = $2
        limit 1
      `,
      [tableName, columnName],
    );

    return (result.rowCount ?? 0) > 0;
  }
}
