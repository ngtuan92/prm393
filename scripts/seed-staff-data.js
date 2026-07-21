const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

async function ensureRole(client, name, description) {
  const result = await client.query(
    `
      insert into roles (name, description)
      values ($1, $2)
      on conflict (name) do update set description = excluded.description
      returning id
    `,
    [name, description],
  );
  return result.rows[0].id;
}

async function ensureUser(client, roleName, email, phone, passwordHash) {
  const result = await client.query(
    `
      insert into users (role_id, email, phone, password_hash, is_active)
      select r.id, $1, $2, $3, true
      from roles r
      where r.name = $4
      on conflict (email) do update
      set phone = excluded.phone,
          password_hash = excluded.password_hash,
          is_active = true,
          role_id = excluded.role_id,
          updated_at = now()
      returning id
    `,
    [email, phone, passwordHash, roleName],
  );
  return result.rows[0].id;
}

async function ensureTeacher(client, teacher) {
  const result = await client.query(
    `
      insert into teachers (
        teacher_code, full_name, gender, date_of_birth, department, user_id
      )
      values ($1, $2, $3, $4, $5, $6)
      on conflict (teacher_code) do update
      set full_name = excluded.full_name,
          gender = excluded.gender,
          date_of_birth = excluded.date_of_birth,
          department = excluded.department,
          user_id = excluded.user_id
      returning teacher_id
    `,
    [
      teacher.code,
      teacher.name,
      teacher.gender,
      teacher.dob,
      teacher.department,
      teacher.userId,
    ],
  );
  return result.rows[0].teacher_id;
}

async function ensureStudent(client, student) {
  const result = await client.query(
    `
      insert into students (student_id, full_name, gender, dob, user_id)
      values ($1, $2, $3, $4, $5)
      on conflict (student_id) do update
      set full_name = excluded.full_name,
          gender = excluded.gender,
          dob = excluded.dob,
          user_id = excluded.user_id
      returning student_id
    `,
    [student.code, student.name, student.gender, student.dob, student.userId],
  );
  return result.rows[0].student_id;
}

async function ensureClassStudent(client, className, studentId, subjectName) {
  const existing = await client.query(
    `
      select 1
      from student_attendances
      where class_name = $1 and student_id = $2
      limit 1
    `,
    [className, studentId],
  );

  if ((existing.rowCount ?? 0) > 0) return;

  await client.query(
    `
      insert into student_attendances (
        student_id, subject_name, class_name, room, study_date, day_of_week,
        slot_name, start_time, end_time, status, note
      )
      values
        ($1, $2, $3, 'Phòng 101', current_date, 'T2', 'Danh sách lớp', '07:30', '08:15', 'Present', ''),
        ($1, $2, $3, 'Phòng 101', current_date + interval '1 day', 'T3', 'Danh sách lớp', '08:20', '09:05', 'Present', '')
    `,
    [studentId, subjectName, className],
  );
}

async function ensureTeacherClass(client, teacherId, className, subjectName) {
  const countResult = await client.query(
    `
      select count(distinct student_id)::int as count
      from student_attendances
      where class_name = $1
    `,
    [className],
  );
  const studentCount = countResult.rows[0]?.count ?? 0;

  await client.query(
    `
      insert into teacher_classes (
        teacher_id, class_name, subject_name, semester, student_count
      )
      values ($1, $2, $3, 'Học kỳ I 2025-2026', $4)
      on conflict do nothing
    `,
    [teacherId, className, subjectName, studentCount],
  );

  await client.query(
    `
      update teacher_classes
      set student_count = $1
      where class_name = $2
    `,
    [studentCount, className],
  );
}

async function ensureTeacherSchedule(
  client,
  teacherId,
  className,
  subjectName,
  semester,
  dayOfWeek,
  slotName,
  startTime,
  endTime,
  room,
) {
  await client.query(
    `
      insert into teacher_schedules (
        teacher_id, class_name, subject_name, semester, day_of_week,
        slot_name, start_time, end_time, room
      )
      select $1::integer, $2::varchar, $3::varchar, $4::varchar, $5::varchar,
             $6::varchar, $7::time, $8::time, $9::varchar
      where not exists (
        select 1
        from teacher_schedules
        where teacher_id = $1
          and class_name = $2
          and subject_name = $3
          and day_of_week = $5
          and start_time = $7::time
          and end_time = $8::time
      )
    `,
    [
      teacherId,
      className,
      subjectName,
      semester,
      dayOfWeek,
      slotName,
      startTime,
      endTime,
      room,
    ],
  );
}

async function ensureTeacherRequest(
  client,
  userId,
  teacherId,
  title,
  type,
  content,
) {
  await client.query(
    `
      insert into requests (
        user_id, role, actor_profile_id, title, type, content, status,
        receiver_name, created_at, updated_at
      )
      select $1, 'TEACHER', $2, $3::varchar, $4::varchar, $5::text, 'Pending',
             'Phòng đào tạo', now(), now()
      where not exists (
        select 1
        from requests
        where user_id = $1 and role = 'TEACHER' and title = $3::varchar
      )
    `,
    [userId, teacherId, title, type, content],
  );
}

async function main() {
  loadEnv();

  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '123456',
    database: process.env.DB_DATABASE || 'fpt_university_db',
  });

  const passwordHash = await bcrypt.hash('123456', 10);

  try {
    await client.connect();
    await client.query('begin');

    await client.query(`
      create table if not exists roles (
        schedule_id serial primary key,
        name varchar(30) not null unique,
        description varchar(255) null
      );

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

      alter table teachers add column if not exists user_id integer null;
      alter table teachers add column if not exists homeroom_class varchar(100) null;
      alter table students add column if not exists user_id integer null;

      create table if not exists student_attendances (
        attendance_id serial primary key,
        student_id varchar(50) not null,
        subject_name varchar(100) not null,
        class_name varchar(100),
        room varchar(100),
        study_date date not null,
        day_of_week varchar(50),
        slot_name varchar(50),
        start_time time,
        end_time time,
        status varchar(50) not null,
        note text
      );

      create table if not exists teacher_classes (
        teacher_class_id serial primary key,
        teacher_id integer not null,
        class_name varchar(100) not null,
        subject_name varchar(100) not null,
        semester varchar(100) not null,
        student_count integer
      );

      create table if not exists teacher_schedules (
        id serial primary key,
        teacher_id integer not null,
        class_name varchar(100) not null,
        subject_name varchar(100) not null,
        semester varchar(100) null,
        day_of_week varchar(50) not null,
        slot_name varchar(50) not null,
        start_time time not null,
        end_time time not null,
        room varchar(100) not null
      );

      alter table teacher_schedules add column if not exists semester varchar(100) null;

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

    await ensureRole(client, 'STUDENT', 'Student account');
    await ensureRole(client, 'TEACHER', 'Teacher account');
    await ensureRole(client, 'PARENT', 'Parent account');
    await ensureRole(client, 'STAFF', 'School staff account');

    const staffUserId = await ensureUser(
      client,
      'STAFF',
      'staff001@fpt.edu.vn',
      '0888888888',
      passwordHash,
    );

    const teacherUserId = await ensureUser(
      client,
      'TEACHER',
      'gvstaffdemo@fpt.edu.vn',
      '0777777777',
      passwordHash,
    );
    const teacherId = await ensureTeacher(client, {
      code: 'GVSTAFF01',
      name: 'Trần Minh Quân',
      gender: 'Nam',
      dob: '1986-08-20',
      department: 'Toán - Tin',
      userId: teacherUserId,
    });

    await client.query(
      'update teachers set homeroom_class = $1 where teacher_id = $2',
      ['10A1', teacherId],
    );

    const demoStudents = [
      ['HSSTAFF01', 'Nguyễn Minh Anh', 'Nữ', '2010-03-12', '0666666601'],
      ['HSSTAFF02', 'Lê Gia Bảo', 'Nam', '2010-07-05', '0666666602'],
      ['HSSTAFF03', 'Phạm Tuệ Lâm', 'Nữ', '2010-11-22', '0666666603'],
      ['HSSTAFF04', 'Hoàng Đức Huy', 'Nam', '2009-09-18', '0666666604'],
    ];

    for (const [code, name, gender, dob, phone] of demoStudents) {
      const userId = await ensureUser(
        client,
        'STUDENT',
        `${code.toLowerCase()}@fpt.edu.vn`,
        phone,
        passwordHash,
      );
      await ensureStudent(client, { code, name, gender, dob, userId });
    }

    await ensureClassStudent(client, '10A1', 'HSSTAFF01', 'Toán học');
    await ensureClassStudent(client, '10A1', 'HSSTAFF02', 'Toán học');
    await ensureClassStudent(client, '11A2', 'HSSTAFF03', 'Ngữ văn');
    await ensureTeacherClass(client, teacherId, '10A1', 'Toán học');
    await ensureTeacherClass(client, teacherId, '11A2', 'Ngữ văn');
    await ensureTeacherSchedule(
      client,
      teacherId,
      '10A1',
      'Toán học',
      'Học kỳ I 2025-2026',
      'T2',
      'Tiết 1',
      '07:30',
      '08:15',
      'Phòng 101',
    );
    await ensureTeacherSchedule(
      client,
      teacherId,
      '11A2',
      'Ngữ văn',
      'Học kỳ I 2025-2026',
      'T4',
      'Tiết 3',
      '09:10',
      '09:55',
      'Phòng 202',
    );

    await ensureTeacherRequest(
      client,
      teacherUserId,
      teacherId,
      'Xin đổi lịch dạy lớp 10A1',
      'ScheduleChange',
      'Giáo viên xin đổi lịch dạy lớp 10A1 sang buổi chiều do trùng lịch họp chuyên môn.',
    );
    await ensureTeacherRequest(
      client,
      teacherUserId,
      teacherId,
      'Đề nghị bổ sung học sinh vào danh sách lớp',
      'RosterUpdate',
      'Cán bộ phòng đào tạo vui lòng kiểm tra và cập nhật danh sách lớp 10A1.',
    );

    await client.query('commit');

    console.log('Seed staff data completed.');
    console.log('Staff login: 0888888888 / 123456');
    console.log(`Staff user id: ${staffUserId}`);
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    console.error('Seed staff data failed:', error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
