import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { POSTGRES_POOL } from '../../database/database.constants';
import { CreateClubRegistrationRequest } from '../../models/requests/create-club-registration.request';

type ClubRow = {
  id: number;
  clubName: string;
  description: string | null;
  category: string | null;
  advisorName: string | null;
  meetingSchedule: string | null;
  location: string | null;
  maxMembers: number;
  memberCount: number;
  registrationStatus: string | null;
};

type RegistrationRow = {
  id: number;
  clubId: number;
  clubName: string;
  studentId: number;
  studentCode: string;
  studentName: string;
  reason: string | null;
  status: string;
  createdAt: string;
  reviewedAt: string | null;
};

@Injectable()
export class ClubsService {
  private schemaReady = false;
  private schemaPromise: Promise<void> | null = null;

  constructor(@Inject(POSTGRES_POOL) private readonly pool: Pool) {}

  async findAll(userId?: number, studentCode?: string): Promise<ClubRow[]> {
    await this.ensureClubsSchema();

    const student = userId ? await this.findStudent(userId, studentCode) : null;
    const result = await this.pool.query<ClubRow>(
      `
        select c.id,
               c.club_name as "clubName",
               c.description,
               c.category,
               c.advisor_name as "advisorName",
               c.meeting_schedule as "meetingSchedule",
               c.location,
               c.max_members as "maxMembers",
               count(cm.student_id)::int as "memberCount",
               coalesce(
                 (
                   select cr.status
                   from club_registrations cr
                   where cr.club_id = c.id
                     and cr.student_id = $1
                   order by cr.created_at desc, cr.id desc
                   limit 1
                 ),
                 case when exists (
                   select 1 from club_members m
                   where m.club_id = c.id and m.student_id = $1
                 ) then 'Approved' else null end
               ) as "registrationStatus"
        from clubs c
        left join club_members cm on cm.club_id = c.id
        where c.status = 'Active'
        group by c.id
        order by c.club_name asc
      `,
      [student?.id ?? null],
    );

    return result.rows;
  }

  async findRegistrations(status?: string): Promise<RegistrationRow[]> {
    await this.ensureClubsSchema();

    const values: string[] = [];
    const where = status ? 'where cr.status = $1' : '';
    if (status) values.push(status);

    const result = await this.pool.query<RegistrationRow>(
      `
        select cr.id,
               cr.club_id as "clubId",
               c.club_name as "clubName",
               cr.student_id as "studentId",
               s.student_id as "studentCode",
               s.full_name as "studentName",
               cr.reason,
               cr.status,
               cr.created_at as "createdAt",
               cr.reviewed_at as "reviewedAt"
        from club_registrations cr
        join clubs c on c.id = cr.club_id
        join students s on s.id = cr.student_id
        ${where}
        order by cr.created_at desc, cr.id desc
      `,
      values,
    );

    return result.rows;
  }

  async register(payload: CreateClubRegistrationRequest) {
    await this.ensureClubsSchema();

    const student = await this.findStudent(payload.userId, payload.studentCode);
    if (!student) {
      throw new BadRequestException('Không tìm thấy hồ sơ học sinh');
    }

    const club = await this.findClub(payload.clubId);
    if (!club) {
      throw new BadRequestException('Không tìm thấy câu lạc bộ');
    }

    const member = await this.pool.query(
      'select 1 from club_members where club_id = $1 and student_id = $2',
      [payload.clubId, student.id],
    );
    if ((member.rowCount ?? 0) > 0) {
      throw new BadRequestException('Học sinh đã tham gia CLB này');
    }

    const pending = await this.pool.query(
      `
        select 1
        from club_registrations
        where club_id = $1 and student_id = $2 and status = 'Pending'
        limit 1
      `,
      [payload.clubId, student.id],
    );
    if ((pending.rowCount ?? 0) > 0) {
      throw new BadRequestException('Đơn đăng ký CLB này đang chờ duyệt');
    }

    await this.assertStudentClubQuota(student.id, payload.clubId);

    const result = await this.pool.query(
      `
        insert into club_registrations (club_id, student_id, reason, status, created_at, updated_at)
        values ($1, $2, $3, 'Pending', now(), now())
        returning id, club_id as "clubId", student_id as "studentId", reason, status, created_at as "createdAt"
      `,
      [payload.clubId, student.id, payload.reason ?? null],
    );

    return result.rows[0];
  }

  async updateRegistrationStatus(id: number, status: string) {
    await this.ensureClubsSchema();

    if (!['Pending', 'Approved', 'Rejected'].includes(status)) {
      throw new BadRequestException('Trạng thái đăng ký không hợp lệ');
    }

    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const current = await client.query<{
        id: number;
        club_id: number;
        student_id: number;
        status: string;
      }>(
        `
          select id, club_id, student_id, status
          from club_registrations
          where id = $1
          for update
        `,
        [id],
      );

      const row = current.rows[0];
      if (!row) {
        throw new BadRequestException('Không tìm thấy đơn đăng ký CLB');
      }

      if (status === 'Approved') {
        await this.assertClubHasCapacity(client, row.club_id);
        await this.assertStudentCanJoin(client, row.student_id, row.club_id);
        await client.query(
          `
            insert into club_members (club_id, student_id, joined_at)
            values ($1, $2, now())
            on conflict (club_id, student_id) do nothing
          `,
          [row.club_id, row.student_id],
        );
      } else {
        await client.query(
          'delete from club_members where club_id = $1 and student_id = $2',
          [row.club_id, row.student_id],
        );
      }

      const updated = await client.query(
        `
          update club_registrations
          set status = $1, reviewed_at = now(), updated_at = now()
          where id = $2
          returning id, club_id as "clubId", student_id as "studentId", reason, status,
                    created_at as "createdAt", reviewed_at as "reviewedAt"
        `,
        [status, id],
      );
      await client.query('commit');
      return updated.rows[0];
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  private async findStudent(userId: number, studentCode?: string) {
    const result = await this.pool.query<{ id: number }>(
      `
        select id
        from students
        where user_id = $1
           or ($2::varchar is not null and student_id = $2)
        limit 1
      `,
      [userId, studentCode || null],
    );
    return result.rows[0] ?? null;
  }

  private async findClub(clubId: number) {
    const result = await this.pool.query<{ id: number }>(
      'select id from clubs where id = $1 and status = $2 limit 1',
      [clubId, 'Active'],
    );
    return result.rows[0] ?? null;
  }

  private async assertClubHasCapacity(
    client: PoolClient,
    clubId: number,
  ): Promise<void> {
    const result = await client.query<{
      max_members: number;
      count: string;
    }>(
      `
        select c.max_members, count(cm.student_id)
        from clubs c
        left join club_members cm on cm.club_id = c.id
        where c.id = $1
        group by c.id
      `,
      [clubId],
    );
    const row = result.rows[0];
    if (row && Number(row.count) >= row.max_members) {
      throw new BadRequestException('CLB đã đủ số lượng thành viên');
    }
  }

  private async assertStudentCanJoin(
    client: PoolClient,
    studentId: number,
    clubId: number,
  ): Promise<void> {
    const result = await client.query<{ count: string }>(
      `
        select count(*)
        from club_members
        where student_id = $1 and club_id <> $2
      `,
      [studentId, clubId],
    );
    if (Number(result.rows[0].count) >= 2) {
      throw new BadRequestException('Học sinh chỉ được tham gia tối đa 2 CLB');
    }
  }

  private async assertStudentClubQuota(
    studentId: number,
    clubId: number,
  ): Promise<void> {
    const result = await this.pool.query<{ count: string }>(
      `
        select count(distinct club_id)
        from (
          select club_id
          from club_members
          where student_id = $1
            and club_id <> $2
          union
          select club_id
          from club_registrations
          where student_id = $1
            and club_id <> $2
            and status in ('Pending', 'Approved')
        ) occupied_clubs
      `,
      [studentId, clubId],
    );

    if (Number(result.rows[0].count) >= 2) {
      throw new BadRequestException(
        'Bạn chỉ được đăng ký hoặc tham gia tối đa 2 CLB',
      );
    }
  }

  private async ensureClubsSchema(): Promise<void> {
    if (this.schemaReady) return;
    if (this.schemaPromise) {
      await this.schemaPromise;
      return;
    }

    this.schemaPromise = this.createClubsSchema();
    try {
      await this.schemaPromise;
      this.schemaReady = true;
    } finally {
      this.schemaPromise = null;
    }
  }

  private async createClubsSchema(): Promise<void> {
    await this.pool.query(`
      create table if not exists clubs (
        id serial primary key,
        club_name varchar(255) not null,
        description text null,
        icon_name varchar(80) null,
        color_hex varchar(20) null
      );

      alter table clubs add column if not exists category varchar(100) null;
      alter table clubs add column if not exists advisor_name varchar(255) null;
      alter table clubs add column if not exists meeting_schedule varchar(255) null;
      alter table clubs add column if not exists location varchar(255) null;
      alter table clubs add column if not exists max_members integer not null default 30;
      alter table clubs add column if not exists status varchar(30) not null default 'Active';

      create table if not exists club_members (
        club_id integer not null,
        student_id integer not null,
        joined_at timestamp without time zone null,
        primary key (club_id, student_id)
      );

      create table if not exists club_registrations (
        id serial primary key,
        club_id integer not null,
        student_id integer not null,
        reason text null,
        status varchar(30) not null default 'Pending',
        created_at timestamp without time zone null default current_timestamp,
        reviewed_at timestamp without time zone null,
        updated_at timestamp without time zone null default current_timestamp
      );

      create index if not exists idx_club_registrations_student on club_registrations(student_id);
      create index if not exists idx_club_registrations_club_status on club_registrations(club_id, status);
      create index if not exists idx_club_members_student on club_members(student_id);
    `);

    const count = await this.pool.query<{ count: string }>(
      'select count(*) from clubs',
    );
    if (Number(count.rows[0].count) === 0) {
      await this.pool.query(`
        insert into clubs (
          club_name, description, icon_name, color_hex, category,
          advisor_name, meeting_schedule, location, max_members, status
        )
        values
          ('CLB Lập trình F-Code', 'Nơi học tập và chia sẻ kinh nghiệm lập trình, thuật toán và sản phẩm công nghệ.', 'code', '#F37021', 'Công nghệ', 'GV Nguyễn Văn A', 'Thứ 4 hằng tuần, 15:30 - 17:00', 'Phòng Lab 1', 30, 'Active'),
          ('CLB Truyền thông', 'Thực hành viết tin, thiết kế ấn phẩm, chụp ảnh và vận hành truyền thông sự kiện.', 'campaign', '#0072BC', 'Truyền thông', 'GV Trần Thị B', 'Thứ 6 hằng tuần, 15:30 - 17:00', 'Phòng Studio', 25, 'Active'),
          ('CLB Vovinam', 'Rèn luyện thể chất, kỷ luật và tinh thần đồng đội qua các buổi tập Vovinam.', 'sports_martial_arts', '#16A34A', 'Thể thao', 'GV Lê Văn C', 'Thứ 3 và Thứ 5, 16:00 - 17:30', 'Nhà đa năng', 40, 'Active')
      `);
    }

    await this.pool.query(`
      update clubs
      set club_name = 'CLB Lập trình F-Code',
          description = 'Nơi học tập và chia sẻ kinh nghiệm lập trình, thuật toán và sản phẩm công nghệ.',
          category = 'Công nghệ',
          advisor_name = 'GV Nguyễn Văn A',
          meeting_schedule = 'Thứ 4 hằng tuần, 15:30 - 17:00',
          location = 'Phòng Lab 1'
      where club_name = 'CLB Lap trinh F-Code'
        and icon_name = 'code';

      update clubs
      set club_name = 'CLB Truyền thông',
          description = 'Thực hành viết tin, thiết kế ấn phẩm, chụp ảnh và vận hành truyền thông sự kiện.',
          category = 'Truyền thông',
          advisor_name = 'GV Trần Thị B',
          meeting_schedule = 'Thứ 6 hằng tuần, 15:30 - 17:00',
          location = 'Phòng Studio'
      where club_name = 'CLB Truyen thong'
        and icon_name = 'campaign';

      update clubs
      set description = 'Rèn luyện thể chất, kỷ luật và tinh thần đồng đội qua các buổi tập Vovinam.',
          category = 'Thể thao',
          advisor_name = 'GV Lê Văn C',
          meeting_schedule = 'Thứ 3 và Thứ 5, 16:00 - 17:30',
          location = 'Nhà đa năng'
      where club_name = 'CLB Vovinam'
        and icon_name = 'sports_martial_arts';
    `);
  }
}
