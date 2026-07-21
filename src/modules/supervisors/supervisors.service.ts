import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { POSTGRES_POOL } from '../../database/database.constants';

@Injectable()
export class SupervisorsService {
  constructor(@Inject(POSTGRES_POOL) private readonly pool: Pool) {}

  async findClasses() {
    const res = await this.pool.query(
      `select distinct class_name as name from student_attendances where class_name is not null order by class_name asc`
    );
    return res.rows;
  }

  async findStudentsByClass(className: string) {
    const res = await this.pool.query(
      `select s.student_id as "studentId", s.full_name as "fullName"
       from students s
       where exists (
         select 1
         from student_attendances sa
         where sa.student_id = s.student_id
           and sa.class_name = $1
       )
       order by s.student_id asc`,
      [className]
    );
    return res.rows;
  }

  async findAttendance(className: string, studyDate: string) {
    const res = await this.pool.query(
      `select s.student_id as "studentId", 
              s.full_name as "fullName",
              coalesce(sa.status, 'Present') as status,
              sa.note
       from students s
       join (
         select student_id 
         from student_attendances 
         where class_name = $1
         group by student_id
       ) cls on s.student_id = cls.student_id
       left join student_attendances sa on s.student_id = sa.student_id 
         and sa.study_date = $2 
         and sa.slot_name = 'Đầu giờ'
       order by s.student_id asc`,
      [className, studyDate]
    );
    return res.rows;
  }

  async saveAttendance(className: string, studyDate: string, attendanceList: any[]) {
    for (const item of attendanceList) {
      const studentId = item.studentId;
      const status = item.status || 'Present';
      const note = item.note || '';

      const updateRes = await this.pool.query(
        `update student_attendances
         set status = $1, note = $2
         where student_id = $3 and study_date = $4 and slot_name = 'Đầu giờ'`,
        [status, note, studentId, studyDate]
      );

      if (updateRes.rowCount === 0) {
        await this.pool.query(
          `insert into student_attendances (student_id, subject_name, class_name, room, study_date, day_of_week, slot_name, status, note)
           values ($1, 'Sinh hoạt đầu giờ', $2, 'Lớp học', $3, trim(to_char($3::date, 'Day')), 'Đầu giờ', $4, $5)`,
          [studentId, className, studyDate, status, note]
        );
      }
    }
    return { success: true };
  }

  async findDisciplineLogs(className?: string, studentId?: string) {
    let query = `
      select dl.id, dl.student_id as "studentId", s.full_name as "fullName",
             dl.class_name as "className", dl.violation_type as "violationType",
             dl.description, dl.image_url as "imageUrl", dl.created_at as "createdAt",
             dl.logged_by as "loggedBy"
      from discipline_logs dl
      join students s on dl.student_id = s.student_id
      where 1=1
    `;
    const params: any[] = [];
    if (className) {
      params.push(className);
      query += ` and dl.class_name = $${params.length}`;
    }
    if (studentId) {
      params.push(studentId);
      query += ` and dl.student_id = $${params.length}`;
    }
    query += ` order by dl.created_at desc`;

    const res = await this.pool.query(query, params);
    return res.rows;
  }

  async logDiscipline(
    studentId: string,
    className: string,
    violationType: string,
    description: string,
    imageUrl: string | null,
    loggedBy: string
  ) {
    const res = await this.pool.query(
      `insert into discipline_logs (student_id, class_name, violation_type, description, image_url, logged_by)
       values ($1, $2, $3, $4, $5, $6)
       returning id`,
      [studentId, className, violationType, description, imageUrl, loggedBy]
    );
    return { success: true, logId: res.rows[0].id };
  }
}
