import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { Pool } from 'pg';
import { POSTGRES_POOL } from '../../database/database.constants';
import * as XLSX from 'xlsx';
import * as ExcelJS from 'exceljs';
import { NotificationsGateway } from '../notifications/notifications.gateway';

@Injectable()
export class TeachersService {
  constructor(
    @Inject(POSTGRES_POOL) private readonly pool: Pool,
    private readonly gateway: NotificationsGateway,
  ) {}

  async findClasses(userId: number) {
    const res = await this.pool.query(
      `
        select tc.class_name as name, 
               tc.subject_name as subject, 
               coalesce(tc.student_count, 0)::text as count
        from teacher_classes tc
        join teachers t on tc.teacher_id = t.teacher_id
        where t.user_id = $1
        order by tc.class_name asc
      `,
      [userId]
    );
    return res.rows;
  }

  async findProfile(userId: number) {
    const teacherRes = await this.pool.query(
      `
        select t.teacher_id as "teacherId",
               t.teacher_code as "teacherCode",
               t.full_name as "fullName",
               t.department,
               t.homeroom_class as "homeroomClass"
        from teachers t
        where t.user_id = $1
        limit 1
      `,
      [userId]
    );

    const teacher = teacherRes.rows[0];
    if (!teacher) {
      return null;
    }

    const assignmentRes = await this.pool.query(
      `
        select tc.class_name as "className",
               tc.subject_name as "subjectName",
               tc.semester,
               coalesce(tc.student_count, 0) as "studentCount"
        from teacher_classes tc
        where tc.teacher_id = $1
        order by tc.semester desc, tc.class_name asc, tc.subject_name asc
      `,
      [teacher.teacherId]
    );

    return {
      ...teacher,
      capabilities: [
        'SUBJECT_TEACHER',
        ...(teacher.homeroomClass ? ['HOMEROOM_TEACHER'] : []),
      ],
      teachingAssignments: assignmentRes.rows,
    };
  }

  private async getHomeroomClass(userId: number): Promise<string | null> {
    const res = await this.pool.query(
      'select homeroom_class from teachers where user_id = $1 limit 1',
      [userId]
    );

    return res.rows[0]?.homeroom_class || null;
  }

  async findHomeroomStudents(userId: number) {
    const className = await this.getHomeroomClass(userId);
    if (!className) {
      return [];
    }

    const res = await this.pool.query(
      `
        select s.student_id as "studentId",
               s.full_name as "fullName",
               $1::text as "className"
        from students s
        where exists (
          select 1
          from student_attendances sa
          where sa.student_id = s.student_id
            and sa.class_name = $1
        )
        order by s.student_id asc
      `,
      [className]
    );
    return res.rows;
  }

  async findHomeroomAttendance(userId: number, studyDate: string) {
    const className = await this.getHomeroomClass(userId);
    if (!className) {
      return [];
    }

    const res = await this.pool.query(
      `
        select s.student_id as "studentId",
               s.full_name as "fullName",
               coalesce(sa.status, 'Present') as status,
               sa.note,
               $2::text as "className"
        from students s
        join (
          select student_id
          from student_attendances
          where class_name = $2
          group by student_id
        ) cls on s.student_id = cls.student_id
        left join student_attendances sa on s.student_id = sa.student_id
          and sa.class_name = $2
          and sa.study_date = $1
        order by s.student_id asc
      `,
      [studyDate, className]
    );
    return res.rows;
  }

  async findSchedule(userId: number) {
    const res = await this.pool.query(
      `
        select ts.day_of_week as day, 
               to_char(ts.start_time, 'HH24:MI') || ' - ' || to_char(ts.end_time, 'HH24:MI') as time,
               ts.slot_name as slot,
               ts.class_name as class,
               ts.subject_name as subject,
               ts.room
        from teacher_schedules ts
        join teachers t on ts.teacher_id = t.teacher_id
        where t.user_id = $1
        order by case 
          when ts.day_of_week = 'T2' then 1
          when ts.day_of_week = 'T3' then 2
          when ts.day_of_week = 'T4' then 3
          when ts.day_of_week = 'T5' then 4
          when ts.day_of_week = 'T6' then 5
          when ts.day_of_week = 'T7' then 6
          else 7
        end, ts.start_time asc
      `,
      [userId]
    );
    return res.rows;
  }

  async findClassGrades(className: string, subject: string, semester: string) {
    const res = await this.pool.query(
      `
        select 
          s.student_id as "studentId",
          s.full_name as "fullName",
          g.oral::float as "oral",
          g.fifteen_min::float as "fifteenMin",
          g.midterm::float as "midterm",
          g.final_exam::float as "finalExam",
          g.score::float as "average"
        from students s
        join (
          select student_id 
          from student_attendances 
          where class_name = $1
          group by student_id
        ) sa on s.student_id = sa.student_id
        left join grades g on s.student_id = g.student_id 
          and g.subject = $2 
          and g.semester = $3
        order by s.student_id asc
      `,
      [className, subject, semester]
    );
    return res.rows;
  }

  private calculateAverage(
    oral: number | null,
    fifteenMin: number | null,
    midterm: number | null,
    finalExam: number | null
  ): number | null {
    let sum = 0;
    let weightSum = 0;

    if (oral !== null && !isNaN(oral)) {
      sum += oral * 1;
      weightSum += 1;
    }
    if (fifteenMin !== null && !isNaN(fifteenMin)) {
      sum += fifteenMin * 1;
      weightSum += 1;
    }
    if (midterm !== null && !isNaN(midterm)) {
      sum += midterm * 2;
      weightSum += 2;
    }
    if (finalExam !== null && !isNaN(finalExam)) {
      sum += finalExam * 3;
      weightSum += 3;
    }

    return weightSum > 0 ? parseFloat((sum / weightSum).toFixed(2)) : null;
  }

  async saveStudentGrade(
    studentId: string,
    subject: string,
    semester: string,
    grades: {
      oral: number | null;
      fifteenMin: number | null;
      midterm: number | null;
      finalExam: number | null;
    }
  ) {
    const average = this.calculateAverage(
      grades.oral,
      grades.fifteenMin,
      grades.midterm,
      grades.finalExam
    );

    // Check if exists
    const checkRes = await this.pool.query(
      'select id from grades where student_id = $1 and subject = $2 and semester = $3',
      [studentId, subject, semester]
    );

    if (checkRes.rowCount && checkRes.rowCount > 0) {
      // Update
      await this.pool.query(
        `
          update grades 
          set oral = $1, fifteen_min = $2, midterm = $3, final_exam = $4, score = $5
          where id = $6
        `,
        [
          grades.oral,
          grades.fifteenMin,
          grades.midterm,
          grades.finalExam,
          average,
          checkRes.rows[0].id,
        ]
      );
    } else {
      // Insert
      await this.pool.query(
        `
          insert into grades (student_id, subject, semester, oral, fifteen_min, midterm, final_exam, score)
          values ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          studentId,
          subject,
          semester,
          grades.oral,
          grades.fifteenMin,
          grades.midterm,
          grades.finalExam,
          average,
        ]
      );
    }
  }

  async saveClassGrades(
    className: string,
    subject: string,
    semester: string,
    gradesList: any[]
  ) {
    for (const item of gradesList) {
      const studentId = item.studentId;
      if (!studentId) continue;

      const oral = item.oral !== undefined && item.oral !== null && item.oral !== '' ? parseFloat(item.oral) : null;
      const fifteenMin = item.fifteenMin !== undefined && item.fifteenMin !== null && item.fifteenMin !== '' ? parseFloat(item.fifteenMin) : null;
      const midterm = item.midterm !== undefined && item.midterm !== null && item.midterm !== '' ? parseFloat(item.midterm) : null;
      const finalExam = item.finalExam !== undefined && item.finalExam !== null && item.finalExam !== '' ? parseFloat(item.finalExam) : null;

      await this.saveStudentGrade(studentId, subject, semester, {
        oral,
        fifteenMin,
        midterm,
        finalExam,
      });
    }
  }

  async generateExcelTemplate(
    className: string,
    subject: string,
    semester: string
  ): Promise<Buffer> {
    const students = await this.pool.query(
      `
        select s.student_id as "studentId", s.full_name as "fullName"
        from students s
        join (
          select student_id 
          from student_attendances 
          where class_name = $1
          group by student_id
        ) sa on s.student_id = sa.student_id
        order by s.student_id asc
      `,
      [className]
    );

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Template');

    // Title styling and configuration
    worksheet.addRow([`MẪU NHẬP ĐIỂM - LỚP ${className.toUpperCase()} - MÔN ${subject.toUpperCase()}`]);
    worksheet.addRow([`Học kỳ: ${semester}`]);
    worksheet.addRow([]); // Blank row

    // Title row styling
    worksheet.getRow(1).font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF1B5E20' } };
    worksheet.getRow(2).font = { name: 'Arial', size: 11, italic: true };

    // Header Row
    const headerRow = worksheet.addRow([
      'Mã Học Sinh',
      'Họ và Tên',
      'Điểm Miệng',
      'Điểm 15 Phút',
      'Điểm Giữa Kỳ',
      'Điểm Cuối Kỳ',
    ]);

    // Header styling
    headerRow.height = 25;
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2E7D32' }, // Nice professional dark green
      };
      cell.font = {
        name: 'Arial',
        size: 11,
        bold: true,
        color: { argb: 'FFFFFFFF' }, // White text
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center',
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFB0BEC5' } },
        left: { style: 'thin', color: { argb: 'FFB0BEC5' } },
        bottom: { style: 'thin', color: { argb: 'FFB0BEC5' } },
        right: { style: 'thin', color: { argb: 'FFB0BEC5' } },
      };
    });

    // Student Rows
    for (const student of students.rows) {
      const row = worksheet.addRow([
        student.studentId,
        student.fullName,
        '',
        '',
        '',
        '',
      ]);
      row.height = 20;
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.font = { name: 'Arial', size: 11 };
        cell.alignment = {
          vertical: 'middle',
          horizontal: colNumber === 2 ? 'left' : 'center',
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFCFD8DC' } },
          left: { style: 'thin', color: { argb: 'FFCFD8DC' } },
          bottom: { style: 'thin', color: { argb: 'FFCFD8DC' } },
          right: { style: 'thin', color: { argb: 'FFCFD8DC' } },
        };
      });
    }

    // Column widths configuration
    worksheet.columns = [
      { width: 18 }, // Mã học sinh
      { width: 28 }, // Họ tên
      { width: 15 }, // Miệng
      { width: 15 }, // 15p
      { width: 15 }, // Giữa kỳ
      { width: 15 }, // Cuối kỳ
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async exportExcelGrades(
    className: string,
    subject: string,
    semester: string
  ): Promise<Buffer> {
    const grades = await this.findClassGrades(className, subject, semester);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Bang Diem');

    // Title row styling and configuration
    worksheet.addRow([`BẢNG ĐIỂM CHI TIẾT - LỚP ${className.toUpperCase()} - MÔN ${subject.toUpperCase()}`]);
    worksheet.addRow([`Học kỳ: ${semester}`]);
    worksheet.addRow([]);

    worksheet.getRow(1).font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF0D47A1' } }; // Professional Dark Blue for exported data
    worksheet.getRow(2).font = { name: 'Arial', size: 11, italic: true };

    // Header Row
    const headerRow = worksheet.addRow([
      'Mã Học Sinh',
      'Họ và Tên',
      'Điểm Miệng',
      'Điểm 15 Phút',
      'Điểm Giữa Kỳ',
      'Điểm Cuối Kỳ',
      'Điểm TB',
    ]);

    // Header styling
    headerRow.height = 25;
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1565C0' }, // Professional dark blue
      };
      cell.font = {
        name: 'Arial',
        size: 11,
        bold: true,
        color: { argb: 'FFFFFFFF' }, // White text
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center',
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFB0BEC5' } },
        left: { style: 'thin', color: { argb: 'FFB0BEC5' } },
        bottom: { style: 'thin', color: { argb: 'FFB0BEC5' } },
        right: { style: 'thin', color: { argb: 'FFB0BEC5' } },
      };
    });

    // Student grade Rows
    for (const item of grades) {
      const row = worksheet.addRow([
        item.studentId,
        item.fullName,
        item.oral !== null ? item.oral.toString() : '',
        item.fifteenMin !== null ? item.fifteenMin.toString() : '',
        item.midterm !== null ? item.midterm.toString() : '',
        item.finalExam !== null ? item.finalExam.toString() : '',
        item.average !== null ? item.average.toString() : '',
      ]);
      row.height = 20;
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.font = { name: 'Arial', size: 11 };
        cell.alignment = {
          vertical: 'middle',
          horizontal: colNumber === 2 ? 'left' : 'center',
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFCFD8DC' } },
          left: { style: 'thin', color: { argb: 'FFCFD8DC' } },
          bottom: { style: 'thin', color: { argb: 'FFCFD8DC' } },
          right: { style: 'thin', color: { argb: 'FFCFD8DC' } },
        };
      });
    }

    // Column widths configuration
    worksheet.columns = [
      { width: 18 }, // Mã học sinh
      { width: 28 }, // Họ tên
      { width: 15 }, // Miệng
      { width: 15 }, // 15p
      { width: 15 }, // Giữa kỳ
      { width: 15 }, // Cuối kỳ
      { width: 15 }, // TB
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async importExcelGrades(
    fileBuffer: Buffer,
    className: string,
    subject: string,
    semester: string
  ): Promise<{ success: boolean; count: number }> {
    const wb = XLSX.read(fileBuffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

    // Rows 0, 1, 2, 3 are headers. Data starts from index 4
    let count = 0;
    for (let i = 4; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;

      const studentId = row[0]?.toString().trim();
      if (!studentId) continue;

      const parseVal = (val: any) => {
        if (val === undefined || val === null || val === '') return null;
        const num = parseFloat(val);
        return isNaN(num) ? null : num;
      };

      const oral = parseVal(row[2]);
      const fifteenMin = parseVal(row[3]);
      const midterm = parseVal(row[4]);
      const finalExam = parseVal(row[5]);

      await this.saveStudentGrade(studentId, subject, semester, {
        oral,
        fifteenMin,
        midterm,
        finalExam,
      });
      count++;
    }

    return { success: true, count };
  }

  async findExamSchedule(userId: number) {
    await this.ensureExamSchedulesTable();

    const res = await this.pool.query(
      `
        select es.id,
               es.class_name as "className",
               es.subject_name as "subjectName",
               to_char(es.exam_date, 'YYYY-MM-DD') as "examDate",
               es.slot_name as "slotName",
               es.room,
               es.semester
        from exam_schedules es
        join teachers t on es.teacher_id = t.teacher_id
        where t.user_id = $1
        order by es.exam_date asc, es.slot_name asc
      `,
      [userId]
    );
    return res.rows;
  }

  async createExamSchedule(payload: {
    className: string;
    subjectName: string;
    examDate: string;
    slotName: string;
    room: string;
    semester: string;
    userId: number;
  }) {
    await this.ensureExamSchedulesTable();

    // 1. Get teacher_id
    const teacherRes = await this.pool.query(
      'select teacher_id from teachers where user_id = $1',
      [payload.userId]
    );
    if (!teacherRes.rowCount || teacherRes.rowCount === 0) {
      throw new BadRequestException('Teacher profile not found');
    }
    const teacherId = teacherRes.rows[0].teacher_id;

    // 2. Insert exam schedule
    const insertRes = await this.pool.query(
      `
        insert into exam_schedules (class_name, subject_name, exam_date, slot_name, room, semester, teacher_id)
        values ($1, $2, $3, $4, $5, $6, $7)
        returning id, class_name, subject_name, to_char(exam_date, 'YYYY-MM-DD') as "examDate", slot_name, room, semester
      `,
      [
        payload.className,
        payload.subjectName,
        payload.examDate,
        payload.slotName,
        payload.room,
        payload.semester,
        teacherId,
      ]
    );
    const createdSchedule = insertRes.rows[0];

    // 3. Find students in this class
    const studentsRes = await this.pool.query(
      `
        select distinct s.user_id as "userId"
        from students s
        join student_attendances sa on s.student_id = sa.student_id
        where sa.class_name = $1 and s.user_id is not null
      `,
      [payload.className]
    );

    // 4. Create and emit notifications for each student
    const title = `Lịch thi mới môn ${payload.subjectName}`;
    const content = `Lịch thi môn ${payload.subjectName} lớp ${payload.className} đã được lên lịch vào ngày ${payload.examDate}, ${payload.slotName} tại phòng ${payload.room}.`;

    for (const student of studentsRes.rows) {
      const notifResult = await this.pool.query(
        `
          insert into app_notifications (user_id, role, class_name, title, content)
          values ($1, 'Student', $2, $3, $4)
          returning id, user_id, role, class_name, title, content, created_at
        `,
        [student.userId, payload.className, title, content]
      );
      const row = notifResult.rows[0];
      const notification = {
        id: row.id,
        userId: row.user_id,
        role: row.role,
        title: row.title,
        content: row.content,
        className: row.class_name || 'Chung',
        createdAt: row.created_at,
      };
      this.gateway.emitNotification(student.userId, 'Student', notification);
    }

    return createdSchedule;
  }

  private async ensureExamSchedulesTable(): Promise<void> {
    await this.pool.query(`
      create table if not exists exam_schedules (
        id serial primary key,
        class_name varchar(100) not null,
        subject_name varchar(100) not null,
        exam_date date not null,
        slot_name varchar(50) not null,
        room varchar(100) not null,
        semester varchar(100) not null,
        teacher_id integer not null
      );

      create index if not exists idx_exam_schedules_class
        on exam_schedules(class_name);
    `);
  }
}
