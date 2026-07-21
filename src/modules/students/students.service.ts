import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { POSTGRES_POOL } from '../../database/database.constants';

@Injectable()
export class StudentsService {
  constructor(@Inject(POSTGRES_POOL) private readonly pool: Pool) {}

  async findGrades(studentId: string) {
    const res = await this.pool.query(
      `
        select subject, semester, 
               score::float as score,
               oral::float as oral,
               fifteen_min::float as "fifteenMin",
               midterm::float as midterm,
               final_exam::float as "finalExam",
               case when score >= 5.0 then 'Đạt' else 'Chưa đạt' end as status
        from grades
        where student_id = $1
        order by semester desc, subject asc
      `,
      [studentId]
    );
    return res.rows;
  }

  async findSchedule(studentId: string) {
    const res = await this.pool.query(
      `
        select subject_name as "subjectName", room, 
               case 
                 when day_of_week = 'Monday' then 'Monday'
                 when day_of_week = 'Tuesday' then 'Tuesday'
                 when day_of_week = 'Wednesday' then 'Wednesday'
                 when day_of_week = 'Thursday' then 'Thursday'
                 when day_of_week = 'Friday' then 'Friday'
                 when day_of_week = 'Saturday' then 'Saturday'
                 else day_of_week
               end as "dayOfWeek",
               to_char(start_time, 'HH24:MI') as "startTime", 
               to_char(end_time, 'HH24:MI') as "endTime", 
               'Học kỳ I 2025-2026' as semester,
               slot_name as slot, 
               status as attendance
        from student_attendances
        where student_id = $1
        order by study_date desc, start_time asc
      `,
      [studentId]
    );
    return res.rows;
  }

  async findTuition(studentId: string) {
    const res = await this.pool.query(
      `
        select semester as term, 
               to_char(amount, 'FM99,999,999') || ' VND' as amount, 
               status
        from tuition_payments
        where student_id = $1
        order by due_date asc
      `,
      [studentId]
    );
    return res.rows;
  }

  async findExamSchedule(studentId: string) {
    await this.ensureExamSchedulesTable();

    const res = await this.pool.query(
      `
        select es.id,
               es.class_name as "className",
               es.subject_name as "subjectName",
               to_char(es.exam_date, 'YYYY-MM-DD') as "examDate",
               es.slot_name as "slotName",
               es.room,
               es.semester,
               t.full_name as "teacherName"
        from exam_schedules es
        join teachers t on es.teacher_id = t.teacher_id
        join (
          select distinct class_name
          from student_attendances
          where student_id = $1
        ) sa on es.class_name = sa.class_name
        order by es.exam_date asc, es.slot_name asc
      `,
      [studentId]
    );
    return res.rows;
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

    const countRes = await this.pool.query('select count(*) from exam_schedules');
    if (Number(countRes.rows[0].count) === 0) {
      await this.pool.query(`
        insert into exam_schedules (class_name, subject_name, exam_date, slot_name, room, semester, teacher_id)
        values
          ('10A1', 'Toán học', '2026-07-25', 'Tiết 1', 'Phòng 101', 'Học kỳ II 2025-2026', 1),
          ('10A1', 'Tin học', '2026-07-27', 'Tiết 3', 'Phòng Lab 1', 'Học kỳ II 2025-2026', 1),
          ('11A2', 'Toán học', '2026-07-26', 'Tiết 2', 'Phòng 202', 'Học kỳ II 2025-2026', 1)
      `);
    }
  }

  async findProfile(studentId: string) {
    const res = await this.pool.query(
      `
        select student_id as "studentId", full_name as "fullName"
        from students
        where student_id = $1
      `,
      [studentId]
    );
    return res.rows[0] || { studentId, fullName: 'Học sinh FPT' };
  }

  async findHomeroomTeacher(studentId: string) {
    // 1. Find the class name of the student
    const classRes = await this.pool.query(
      `
        select distinct class_name as "className"
        from student_attendances
        where student_id = $1
        limit 1
      `,
      [studentId]
    );

    if (!classRes.rowCount || classRes.rowCount === 0) {
      return null;
    }

    const className = classRes.rows[0].className;

    // 2. Find the homeroom teacher of this class
    const teacherRes = await this.pool.query(
      `
        select 
          t.teacher_id as "teacherId",
          t.teacher_code as "teacherCode",
          t.full_name as "fullName",
          u.email,
          u.phone,
          t.gender,
          t.department
        from teachers t
        join users u on t.user_id = u.id
        where t.homeroom_class = $1
        limit 1
      `,
      [className]
    );

    return teacherRes.rows[0] || null;
  }
}
