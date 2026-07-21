import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { Pool, PoolClient } from 'pg';
import { POSTGRES_POOL } from '../../database/database.constants';
import { UserRole } from '../../models/enums/user-role.enum';
import { LoginRequest } from '../../models/requests/login.request';
import { ResetPasswordRequest } from '../../models/requests/reset-password.request';
import {
  AuthProfileResponse,
  AuthUserResponse,
  LoginResponse,
} from '../../models/responses/auth.response';
import { MailService } from '../mail/mail.service';

type AuthUserRow = {
  id: number;
  email: string;
  phone: string | null;
  password_hash: string;
  is_active: boolean;
  role: UserRole;
  profile_id: number;
  profile_code: string;
  full_name: string;
  gender: string | null;
  date_of_birth: string | null;
  department: string | null;
  homeroom_class: string | null;
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(POSTGRES_POOL) private readonly pool: Pool,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  async login(payload: LoginRequest): Promise<LoginResponse> {
    await this.ensureAuthSchema();

    const user = await this.findUserByPhone(payload.phone);

    if (!user || !user.is_active) {
      throw new UnauthorizedException('Invalid phone or password');
    }

    const isPasswordValid = await bcrypt.compare(
      payload.password,
      user.password_hash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid phone or password');
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      role: user.role,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      user: this.toUserResponse(user),
    };
  }

  async requestPasswordReset(email: string): Promise<void> {
    await this.ensureAuthSchema();

    const user = await this.findUserByEmail(email);

    if (!user) {
      throw new NotFoundException('User email does not exist');
    }

    await this.ensurePasswordResetTable();

    const otp = randomInt(100000, 1000000).toString();
    const otpHash = await bcrypt.hash(otp, 10);

    await this.pool.query(
      `
        insert into password_reset_tokens (email, otp_hash, expires_at)
        values ($1, $2, now() + interval '10 minutes')
      `,
      [email, otpHash],
    );

    await this.mailService.sendPasswordResetOtp(email, otp);
  }

  async resetPassword(payload: ResetPasswordRequest): Promise<void> {
    await this.ensurePasswordResetTable();

    await this.ensureAuthSchema();

    const user = await this.findUserByEmail(payload.email);

    if (!user) {
      throw new NotFoundException('User email does not exist');
    }

    const tokenResult = await this.pool.query<{
      id: number;
      otp_hash: string;
    }>(
      `
        select id, otp_hash
        from password_reset_tokens
        where email = $1
          and used_at is null
          and expires_at > now()
        order by created_at desc
        limit 1
      `,
      [payload.email],
    );

    const token = tokenResult.rows[0];

    if (!token) {
      throw new BadRequestException('OTP is invalid or expired');
    }

    const isOtpValid = await bcrypt.compare(payload.otp, token.otp_hash);

    if (!isOtpValid) {
      throw new BadRequestException('OTP is invalid or expired');
    }

    const passwordHash = await bcrypt.hash(payload.newPassword, 10);

    const client = await this.pool.connect();
    try {
      await client.query('begin');

      await client.query(
        'update users set password_hash = $1, updated_at = now() where email = $2',
        [passwordHash, payload.email],
      );

      await client.query(
        'update password_reset_tokens set used_at = now() where id = $1',
        [token.id],
      );

      await client.query('commit');
    } catch (error) {
      await this.rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  private async findUserByPhone(phone: string): Promise<AuthUserRow | null> {
    const result = await this.pool.query<AuthUserRow>(
      `
        ${this.authUserSelect()}
        where u.phone = $1
        limit 1
      `,
      [phone],
    );

    return result.rows[0] || null;
  }

  private async findUserByEmail(email: string): Promise<AuthUserRow | null> {
    const result = await this.pool.query<AuthUserRow>(
      `
        ${this.authUserSelect()}
        where u.email = $1
        limit 1
      `,
      [email],
    );

    return result.rows[0] || null;
  }

  private async ensureAuthSchema(): Promise<void> {
    const defaultPasswordHash = await bcrypt.hash('123456', 10);

    await this.pool.query(`
      create table if not exists roles (
        id serial primary key,
        name varchar(30) not null unique,
        description varchar(255) null
      );

      insert into roles (name, description)
      values
        ('${UserRole.Student}', 'Student account'),
        ('${UserRole.Teacher}', 'Teacher account'),
        ('${UserRole.Parent}', 'Parent account'),
        ('${UserRole.Staff}', 'School staff account')
      on conflict (name) do nothing;

      create table if not exists users (
        id serial primary key,
        role_id integer not null references roles(id),
        email varchar(100) not null unique,
        phone varchar(30) null unique,
        password_hash varchar(255) not null,
        is_active boolean not null default true,
        created_at timestamp without time zone not null default current_timestamp,
        updated_at timestamp without time zone not null default current_timestamp
      );

      alter table students add column if not exists user_id integer null;
      alter table teachers add column if not exists user_id integer null;
      alter table teachers add column if not exists homeroom_class varchar(100) null;
      alter table parents add column if not exists user_id integer null;

      create unique index if not exists idx_students_user_id on students(user_id) where user_id is not null;
      create unique index if not exists idx_teachers_user_id on teachers(user_id) where user_id is not null;
      create unique index if not exists idx_parents_user_id on parents(user_id) where user_id is not null;
    `);

    if (
      await this.hasColumns('students', ['email', 'phone', 'password_hash'])
    ) {
      await this.pool.query(`
      insert into users (role_id, email, phone, password_hash, is_active)
      select r.id, s.email, s.phone, s.password_hash, true
      from students s
      cross join roles r
      where r.name = '${UserRole.Student}'
        and s.email is not null
        and s.password_hash is not null
        and not exists (
          select 1
          from users u
          where u.email = s.email
             or (s.phone is not null and u.phone = s.phone)
        )
      on conflict do nothing;
      `);

      await this.pool.query(`
      update students s
      set user_id = u.id
      from users u
      join roles r on r.id = u.role_id
      where r.name = '${UserRole.Student}'
        and u.email = s.email
        and s.user_id is null;
      `);
    }

    if (await this.hasColumns('teachers', ['email', 'phone'])) {
      await this.pool.query(
        `
          insert into users (role_id, email, phone, password_hash, is_active)
          select
            r.id,
            coalesce(t.email, lower(t.teacher_code) || '@fpt.edu.vn'),
            t.phone,
            $1,
            true
          from teachers t
          cross join roles r
          where r.name = '${UserRole.Teacher}'
            and t.phone is not null
            and not exists (
              select 1
              from users u
              where u.email = coalesce(t.email, lower(t.teacher_code) || '@fpt.edu.vn')
                 or u.phone = t.phone
            )
          on conflict do nothing;
        `,
        [defaultPasswordHash],
      );

      await this.pool.query(`
        update teachers t
        set user_id = u.id
        from users u
        join roles r on r.id = u.role_id
        where r.name = '${UserRole.Teacher}'
          and t.user_id is null
          and (
            u.email = coalesce(t.email, lower(t.teacher_code) || '@fpt.edu.vn')
            or u.phone = t.phone
          );
      `);
    }

    if (await this.hasColumns('parents', ['email', 'phone'])) {
      await this.pool.query(
        `
          insert into users (role_id, email, phone, password_hash, is_active)
          select
            r.id,
            coalesce(p.email, 'parent' || p.parent_id::text || '@fpt.edu.vn'),
            p.phone,
            $1,
            true
          from parents p
          cross join roles r
          where r.name = '${UserRole.Parent}'
            and p.phone is not null
            and not exists (
              select 1
              from users u
              where u.email = coalesce(p.email, 'parent' || p.parent_id::text || '@fpt.edu.vn')
                 or u.phone = p.phone
            )
          on conflict do nothing;
        `,
        [defaultPasswordHash],
      );

      await this.pool.query(`
        update parents p
        set user_id = u.id
        from users u
        join roles r on r.id = u.role_id
        where r.name = '${UserRole.Parent}'
          and p.user_id is null
          and (
            u.email = coalesce(p.email, 'parent' || p.parent_id::text || '@fpt.edu.vn')
            or u.phone = p.phone
          );
      `);
    }

    await this.pool.query(
      `
        insert into users (role_id, email, phone, password_hash, is_active)
        select r.id, 'staff001@fpt.edu.vn', '0888888888', $1, true
        from roles r
        where r.name = '${UserRole.Staff}'
          and not exists (select 1 from users where phone = '0888888888' or email = 'staff001@fpt.edu.vn')
        on conflict (email) do nothing;
      `,
      [defaultPasswordHash],
    );

    // Legacy GT001 profile is only linked when a matching teacher user already exists.
    await this.pool.query(`
      insert into teachers (teacher_code, full_name, gender, date_of_birth, department, user_id)
      select 'GT001', 'Nguyễn Văn A - Giám thị', 'Nam', '1985-05-15', 'Tổ Giám thị', u.id
      from users u
      join roles r on r.id = u.role_id
      where r.name = '${UserRole.Teacher}'
        and u.email = 'giamthi001@fpt.edu.vn'
        and not exists (select 1 from teachers where teacher_code = 'GT001')
      on conflict (teacher_code) do nothing;
    `);

    await this.promoteUserIdToRequired('students');
    await this.promoteUserIdToRequired('teachers');
    await this.promoteUserIdToRequired('parents');
    await this.dropLegacyProfileColumns();
  }

  private async hasColumns(tableName: string, columnNames: string[]) {
    const result = await this.pool.query<{ column_name: string }>(
      `
        select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = $1
          and column_name = any($2)
      `,
      [tableName, columnNames],
    );

    return result.rowCount === columnNames.length;
  }

  private async promoteUserIdToRequired(tableName: string): Promise<void> {
    const unlinked = await this.pool.query<{ count: string }>(
      `select count(*) from ${tableName} where user_id is null`,
    );

    if (Number(unlinked.rows[0].count) > 0) {
      return;
    }

    await this.pool
      .query(
        `
      alter table ${tableName}
        alter column user_id set not null,
        add constraint fk_${tableName}_user
          foreign key (user_id) references users(id)
          on delete restrict;
    `,
      )
      .catch((error: { code?: string }) => {
        if (error.code !== '42710') {
          throw error;
        }
      });
  }

  private async dropLegacyProfileColumns(): Promise<void> {
    await this.pool.query(`
      alter table students
        drop column if exists email,
        drop column if exists phone,
        drop column if exists password_hash,
        drop column if exists primary_role;

      alter table teachers
        drop column if exists email,
        drop column if exists phone;

      alter table parents
        drop column if exists email,
        drop column if exists phone;
    `);
  }

  private async ensurePasswordResetTable(): Promise<void> {
    await this.pool.query(`
      create table if not exists password_reset_tokens (
        id serial primary key,
        email varchar(100) not null,
        otp_hash varchar(255) not null,
        expires_at timestamp without time zone not null,
        used_at timestamp without time zone null,
        created_at timestamp without time zone default current_timestamp
      )
    `);
  }

  private authUserSelect(): string {
    return `
      select
        u.id,
        u.email,
        u.phone,
        u.password_hash,
        u.is_active,
        r.name as role,
        case
          when r.name = '${UserRole.Student}' then s.id
          when r.name = '${UserRole.Teacher}' then t.teacher_id
          when r.name = '${UserRole.Staff}' then u.id
          when r.name = '${UserRole.Parent}' then p.parent_id
        end as profile_id,
        case
          when r.name = '${UserRole.Student}' then s.student_id
          when r.name = '${UserRole.Teacher}' then t.teacher_code
          when r.name = '${UserRole.Staff}' then 'STAFF' || u.id::text
          when r.name = '${UserRole.Parent}' then (select student_id from parent_students where parent_id = p.parent_id limit 1)
        end as profile_code,
        case
          when r.name = '${UserRole.Student}' then s.full_name
          when r.name = '${UserRole.Teacher}' then t.full_name
          when r.name = '${UserRole.Staff}' then split_part(u.email, '@', 1)
          when r.name = '${UserRole.Parent}' then p.full_name
        end as full_name,
        case
          when r.name = '${UserRole.Student}' then s.gender
          when r.name = '${UserRole.Teacher}' then t.gender
          when r.name = '${UserRole.Staff}' then null
          when r.name = '${UserRole.Parent}' then p.gender
        end as gender,
        case
          when r.name = '${UserRole.Student}' then s.dob
          when r.name = '${UserRole.Teacher}' then t.date_of_birth::text
          when r.name = '${UserRole.Staff}' then null
          when r.name = '${UserRole.Parent}' then p.date_of_birth::text
        end as date_of_birth,
        case
          when r.name = '${UserRole.Teacher}' then t.department
          when r.name = '${UserRole.Staff}' then 'Phong dao tao'
          else null
        end as department,
        case
          when r.name = '${UserRole.Teacher}' then t.homeroom_class
          else null
        end as homeroom_class
      from users u
      join roles r on r.id = u.role_id
      left join students s on s.user_id = u.id
      left join teachers t on t.user_id = u.id
      left join parents p on p.user_id = u.id
    `;
  }

  private toUserResponse(user: AuthUserRow): AuthUserResponse {
    const profile: AuthProfileResponse = {
      id: user.profile_id,
      code: user.profile_code,
      fullName: user.full_name,
      email: user.email,
      phone: user.phone,
      gender: user.gender,
      dateOfBirth: user.date_of_birth,
      department: user.department,
      homeroomClass: user.homeroom_class,
      teacherCapabilities:
        user.role === UserRole.Teacher
          ? [
              'SUBJECT_TEACHER',
              ...(user.homeroom_class ? ['HOMEROOM_TEACHER'] : []),
            ]
          : undefined,
    };

    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      profile,
    };
  }

  private async rollback(client: PoolClient): Promise<void> {
    try {
      await client.query('rollback');
    } catch {
      // Ignore rollback errors so the original database error can bubble up.
    }
  }
}
