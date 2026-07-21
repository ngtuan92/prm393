import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { POSTGRES_POOL } from '../../database/database.constants';
import { UserRole } from '../../models/enums/user-role.enum';
import * as XLSX from 'xlsx';
import * as ExcelJS from 'exceljs';

@Injectable()
export class StaffsService {
  constructor(@Inject(POSTGRES_POOL) private readonly pool: Pool) {}

  async findClasses() {
    const res = await this.pool.query(`
      with class_students as (
        select class_name, count(distinct student_id) as student_count
        from student_attendances
        where class_name is not null
        group by class_name
      )
      select cs.class_name as name,
             coalesce(cs.student_count, 0)::int as "studentCount",
             t.teacher_id as "homeroomTeacherId",
             t.full_name as "homeroomTeacherName"
      from class_students cs
      left join lateral (
        select teacher_id, full_name
        from teachers
        where homeroom_class = cs.class_name
        order by teacher_id asc
        limit 1
      ) t on true
      order by cs.class_name asc
    `);
    return res.rows;
  }

  async findStudentsByClass(className: string) {
    this.assertClassName(className);
    const res = await this.pool.query(
      `
        select s.student_id as "studentId", s.full_name as "fullName"
        from students s
        where exists (
          select 1
          from student_attendances sa
          where sa.student_id = s.student_id
            and sa.class_name = $1
        )
        order by s.student_id asc
      `,
      [className],
    );
    return res.rows;
  }

  async findAvailableStudents(className: string) {
    this.assertClassName(className);
    const res = await this.pool.query(
      `
        select s.student_id as "studentId", s.full_name as "fullName"
        from students s
        where not exists (
          select 1
          from student_attendances sa
          where sa.student_id = s.student_id
            and sa.class_name = $1
        )
        order by s.student_id asc
      `,
      [className],
    );
    return res.rows;
  }

  async exportClassRoster(className: string): Promise<Buffer> {
    this.assertClassName(className);
    const students = await this.findStudentsByClass(className);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Danh sách lớp');
    sheet.columns = [
      { header: 'Mã học sinh', key: 'studentId', width: 20 },
      { header: 'Họ và tên', key: 'fullName', width: 34 },
    ];
    students.forEach((student) => sheet.addRow(student));
    this.styleRosterSheet(sheet);
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async exportClassRosterTemplate(className: string): Promise<Buffer> {
    this.assertClassName(className);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Mẫu danh sách lớp');
    sheet.addRow([`MẪU NHẬP DANH SÁCH LỚP ${className.toUpperCase()}`]);
    sheet.addRow([
      'Chỉ nhập mã học sinh đã tồn tại trong hệ thống vào cột "Mã học sinh". Cột "Họ và tên" dùng để đối chiếu, hệ thống không cập nhật tên từ file này.',
    ]);
    sheet.addRow([]);
    sheet.addRow(['Mã học sinh', 'Họ và tên']);
    sheet.addRow(['HS100001', 'Nguyễn Văn A']);
    sheet.addRow(['HS100002', 'Trần Thị B']);
    sheet.mergeCells('A1:B1');
    sheet.mergeCells('A2:B2');
    sheet.columns = [
      { key: 'studentId', width: 20 },
      { key: 'fullName', width: 34 },
    ];
    sheet.getRow(1).font = { bold: true, size: 14 };
    sheet.getRow(2).alignment = { wrapText: true };
    sheet.getRow(4).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(4).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF37021' },
    };
    sheet.getRow(4).alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.autoFilter = 'A4:B4';
    sheet.views = [{ state: 'frozen', ySplit: 4 }];
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private styleRosterSheet(sheet: ExcelJS.Worksheet) {
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF37021' },
    };
    header.alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.autoFilter = 'A1:B1';
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  }

  async importClassRoster(fileBuffer: Buffer | undefined, className: string) {
    this.assertClassName(className);
    if (!fileBuffer?.length) {
      throw new BadRequestException('Vui lòng chọn file Excel');
    }

    let rows: unknown[][];
    try {
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: '',
      });
    } catch {
      throw new BadRequestException('File Excel không hợp lệ');
    }

    const headerIndex = rows.findIndex(
      (row) => this.normalizeHeaderCell(row?.[0]) === 'ma hoc sinh',
    );
    const firstDataRow = headerIndex >= 0 ? headerIndex + 1 : 1;

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const errors: { row: number; studentId: string; message: string }[] = [];
    const seen = new Set<string>();
    for (let index = firstDataRow; index < rows.length; index++) {
      const studentId = String(rows[index]?.[0] ?? '').trim();
      const fullName = String(rows[index]?.[1] ?? '').trim();
      if (!studentId) continue;
      if (this.normalizeHeaderCell(studentId) === 'ma hoc sinh') continue;
      if (seen.has(studentId)) {
        skipped++;
        continue;
      }
      seen.add(studentId);
      try {
        const student = await this.pool.query(
          'select full_name from students where student_id = $1 limit 1',
          [studentId],
        );
        if (student.rowCount === 0) {
          throw new BadRequestException('Kh么ng t矛m th岷 h峄峜 sinh');
        }
        if (fullName && fullName !== student.rows[0]?.full_name) {
          await this.pool.query(
            'update students set full_name = $1 where student_id = $2',
            [fullName, studentId],
          );
          updated++;
        }

        const existing = await this.pool.query(
          `select 1 from student_attendances
           where student_id = $1 and class_name = $2 limit 1`,
          [studentId, className],
        );
        if ((existing.rowCount ?? 0) > 0) {
          skipped++;
          continue;
        }
        await this.addStudentToClass(className, studentId);
        imported++;
      } catch (error) {
        errors.push({
          row: index + 1,
          studentId,
          message:
            error instanceof Error ? error.message : 'Nhập dữ liệu thất bại',
        });
      }
    }
    return { success: errors.length === 0, imported, updated, skipped, errors };
  }

  private normalizeHeaderCell(value: unknown) {
    return String(value ?? '')
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  async addStudentToClass(
    className: string,
    studentId: string,
    subjectName?: string,
  ) {
    this.assertClassName(className);
    if (!studentId?.trim()) {
      throw new BadRequestException('Vui lòng nhập mã học sinh');
    }

    const student = await this.pool.query(
      'select 1 from students where student_id = $1 limit 1',
      [studentId],
    );
    if (student.rowCount === 0) {
      throw new BadRequestException('Không tìm thấy học sinh');
    }

    const existing = await this.pool.query(
      `
        select 1
        from student_attendances
        where student_id = $1 and class_name = $2
        limit 1
      `,
      [studentId, className],
    );
    if ((existing.rowCount ?? 0) > 0) {
      return { success: true, message: 'Học sinh đã có trong lớp này' };
    }

    const template = await this.pool.query(
      `
        select subject_name, room, study_date, day_of_week, slot_name, start_time, end_time
        from student_attendances
        where class_name = $1
        order by study_date asc, start_time asc nulls last
        limit 1
      `,
      [className],
    );

    const row = template.rows[0] ?? {};
    await this.pool.query(
      `
        insert into student_attendances (
          student_id, subject_name, class_name, room, study_date, day_of_week,
          slot_name, start_time, end_time, status, note
        )
        values (
          $1, $2, $3, $4, coalesce($5::date, current_date), $6,
          $7, $8, $9, 'Present', ''
        )
      `,
      [
        studentId,
        subjectName?.trim() || row.subject_name || 'Sinh hoạt lớp',
        className,
        row.room || 'Lớp học',
        row.study_date || null,
        row.day_of_week || null,
        row.slot_name || 'Danh sách lớp',
        row.start_time || null,
        row.end_time || null,
      ],
    );

    await this.refreshTeacherClassCounts(className);
    return { success: true };
  }

  async removeStudentFromClass(className: string, studentId: string) {
    this.assertClassName(className);
    const res = await this.pool.query(
      'delete from student_attendances where class_name = $1 and student_id = $2',
      [className, studentId],
    );
    await this.refreshTeacherClassCounts(className);
    return { success: true, removed: res.rowCount ?? 0 };
  }

  async findTeachers() {
    const res = await this.pool.query(`
      select teacher_id as "teacherId",
             teacher_code as "teacherCode",
             full_name as "fullName",
             department,
             homeroom_class as "homeroomClass"
      from teachers
      order by full_name asc
    `);
    return res.rows;
  }

  async assignHomeroomTeacher(className: string, teacherId: number) {
    this.assertClassName(className);
    if (!teacherId) {
      throw new BadRequestException('Vui lòng chọn giáo viên');
    }

    const teacher = await this.pool.query(
      'select 1 from teachers where teacher_id = $1 limit 1',
      [teacherId],
    );
    if (teacher.rowCount === 0) {
      throw new BadRequestException('Không tìm thấy giáo viên');
    }

    await this.pool.query(
      'update teachers set homeroom_class = null where homeroom_class = $1',
      [className],
    );
    await this.pool.query(
      'update teachers set homeroom_class = null where teacher_id = $1',
      [teacherId],
    );
    await this.pool.query(
      'update teachers set homeroom_class = $1 where teacher_id = $2',
      [className, teacherId],
    );

    return { success: true };
  }

  async findSchedules(className?: string) {
    await this.ensureTeacherSchedulesTable();
    const params: any[] = [];
    let where = '';
    if (className?.trim()) {
      params.push(className.trim());
      where = 'where ts.class_name = $1';
    }

    const res = await this.pool.query(
      `
        select ts.schedule_id as id,
               ts.class_name as "className",
               ts.subject_name as "subjectName",
               ts.semester,
               ts.day_of_week as "dayOfWeek",
               ts.slot_name as "slotName",
               to_char(ts.start_time, 'HH24:MI') as "startTime",
               to_char(ts.end_time, 'HH24:MI') as "endTime",
               ts.room,
               t.teacher_id as "teacherId",
               t.full_name as "teacherName"
        from teacher_schedules ts
        join teachers t on ts.teacher_id = t.teacher_id
        ${where}
        order by case
          when ts.day_of_week = 'T2' then 1
          when ts.day_of_week = 'T3' then 2
          when ts.day_of_week = 'T4' then 3
          when ts.day_of_week = 'T5' then 4
          when ts.day_of_week = 'T6' then 5
          when ts.day_of_week = 'T7' then 6
          else 7
        end, ts.start_time asc, ts.class_name asc
      `,
      params,
    );
    return res.rows;
  }

  async createSchedule(payload: {
    className: string;
    teacherId: number;
    subjectName: string;
    semester: string;
    studyDate: string;
    dayOfWeek: string;
    slotName: string;
    startTime: string;
    endTime: string;
    room: string;
  }) {
    await this.ensureTeacherSchedulesTable();
    this.assertClassName(payload.className);
    this.assertRequired(payload.subjectName, 'Vui lòng nhập môn học');
    this.assertRequired(payload.semester, 'Vui lòng nhập học kỳ');
    this.assertRequired(payload.studyDate, 'Vui lòng chọn ngày học');
    this.assertRequired(payload.dayOfWeek, 'Vui lòng chọn thứ');
    this.assertRequired(payload.slotName, 'Vui lòng nhập tiết học');
    this.assertRequired(payload.startTime, 'Vui lòng nhập giờ bắt đầu');
    this.assertRequired(payload.endTime, 'Vui lòng nhập giờ kết thúc');
    this.assertRequired(payload.room, 'Vui lòng nhập phòng học');

    if (!payload.teacherId) {
      throw new BadRequestException('Vui lòng chọn giáo viên');
    }

    const teacher = await this.pool.query(
      'select 1 from teachers where teacher_id = $1 limit 1',
      [payload.teacherId],
    );
    if (teacher.rowCount === 0) {
      throw new BadRequestException('Không tìm thấy giáo viên');
    }

    const students = await this.pool.query(
      `
        select distinct student_id
        from student_attendances
        where class_name = $1
      `,
      [payload.className],
    );
    if (students.rowCount === 0) {
      throw new BadRequestException('Lớp chưa có học sinh');
    }

    const duplicateTeacher = await this.pool.query(
      `
        select 1
        from teacher_schedules
        where teacher_id = $1
          and day_of_week = $2
          and start_time = $3::time
          and end_time = $4::time
        limit 1
      `,
      [
        payload.teacherId,
        payload.dayOfWeek,
        payload.startTime,
        payload.endTime,
      ],
    );
    if ((duplicateTeacher.rowCount ?? 0) > 0) {
      throw new BadRequestException('Giáo viên đã có lịch ở khung giờ này');
    }

    const duplicateClass = await this.pool.query(
      `
        select 1
        from teacher_schedules
        where class_name = $1
          and day_of_week = $2
          and start_time = $3::time
          and end_time = $4::time
        limit 1
      `,
      [
        payload.className,
        payload.dayOfWeek,
        payload.startTime,
        payload.endTime,
      ],
    );
    if ((duplicateClass.rowCount ?? 0) > 0) {
      throw new BadRequestException('Lớp đã có lịch ở khung giờ này');
    }

    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const scheduleRes = await client.query(
        `
          insert into teacher_schedules (
            teacher_id, class_name, subject_name, semester, day_of_week,
            slot_name, start_time, end_time, room
          )
          values ($1, $2, $3, $4, $5, $6, $7::time, $8::time, $9)
          returning schedule_id as id,
                    class_name as "className",
                    subject_name as "subjectName",
                    semester,
                    day_of_week as "dayOfWeek",
                    slot_name as "slotName",
                    to_char(start_time, 'HH24:MI') as "startTime",
                    to_char(end_time, 'HH24:MI') as "endTime",
                    room
        `,
        [
          payload.teacherId,
          payload.className,
          payload.subjectName,
          payload.semester,
          payload.dayOfWeek,
          payload.slotName,
          payload.startTime,
          payload.endTime,
          payload.room,
        ],
      );

      for (const student of students.rows) {
        await client.query(
          `
            insert into student_attendances (
              student_id, subject_name, class_name, room, study_date,
              day_of_week, slot_name, start_time, end_time, status, note
            )
            values ($1, $2, $3, $4, $5::date, $6, $7, $8::time, $9::time, 'Present', '')
          `,
          [
            student.student_id,
            payload.subjectName,
            payload.className,
            payload.room,
            payload.studyDate,
            payload.dayOfWeek,
            payload.slotName,
            payload.startTime,
            payload.endTime,
          ],
        );
      }

      await this.upsertTeacherClass(
        client,
        payload.teacherId,
        payload.className,
        payload.subjectName,
        payload.semester,
      );
      await client.query('commit');
      return {
        success: true,
        schedule: scheduleRes.rows[0],
        studentCount: students.rowCount ?? 0,
      };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async findTeacherApplications() {
    const res = await this.pool.query(
      `
        select r.id, r.user_id, r.role, r.actor_profile_id, r.title, r.type,
               r.content, r.status, r.receiver_name, r.created_at, r.updated_at,
               coalesce(t.full_name, u.email) as sender_name
        from requests r
        left join users u on r.user_id = u.id
        left join teachers t on r.user_id = t.user_id
        where r.role = $1
        order by r.created_at desc, r.id desc
      `,
      [UserRole.Teacher],
    );
    return res.rows;
  }

  private async refreshTeacherClassCounts(className: string) {
    await this.pool.query(
      `
        update teacher_classes tc
        set student_count = counts.student_count
        from (
          select class_name, count(distinct student_id)::int as student_count
          from student_attendances
          where class_name = $1
          group by class_name
        ) counts
        where tc.class_name = counts.class_name
      `,
      [className],
    );
  }

  private async upsertTeacherClass(
    client: any,
    teacherId: number,
    className: string,
    subjectName: string,
    semester: string,
  ) {
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
        select $1::integer, $2::varchar, $3::varchar, $4::varchar, $5::integer
        where not exists (
          select 1 from teacher_classes
          where teacher_id = $1::integer
            and class_name = $2::varchar
            and subject_name = $3::varchar
            and semester = $4::varchar
        )
      `,
      [teacherId, className, subjectName, semester, studentCount],
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

  private async ensureTeacherSchedulesTable() {
    await this.pool.query(`
      create table if not exists teacher_schedules (
        schedule_id serial primary key,
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

      create index if not exists idx_teacher_schedules_teacher
        on teacher_schedules(teacher_id);

      create index if not exists idx_teacher_schedules_class
        on teacher_schedules(class_name);
    `);
  }

  private assertRequired(value: string, message: string) {
    if (!value?.trim()) {
      throw new BadRequestException(message);
    }
  }

  private assertClassName(className: string) {
    if (!className?.trim()) {
      throw new BadRequestException('Vui lòng chọn lớp');
    }
  }
}
