import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { Pool } from 'pg';
import { POSTGRES_POOL } from '../../database/database.constants';
import { CreateLearningMaterialRequest } from '../../models/requests/create-learning-material.request';
import { NotificationsGateway } from '../notifications/notifications.gateway';

@Injectable()
export class LearningMaterialsService {
  private readonly uploadDir = resolve(process.cwd(), 'uploads', 'learning-materials');

  constructor(
    @Inject(POSTGRES_POOL) private readonly pool: Pool,
    private readonly gateway: NotificationsGateway,
  ) {}

  async findForTeacher(
    userId: number,
    className?: string,
    subjectName?: string,
    semester?: string,
  ) {
    await this.ensureLearningMaterialsTable();

    const params: any[] = [userId];
    let query = `
      select lm.id,
             lm.class_name as "className",
             lm.subject_name as "subjectName",
             lm.semester,
             lm.title,
             lm.description,
             lm.material_type as "materialType",
             lm.resource_url as "resourceUrl",
             lm.week_number as "weekNumber",
             t.full_name as "teacherName",
             lm.created_at as "createdAt"
      from learning_materials lm
      join teachers t on lm.teacher_id = t.teacher_id
      where t.user_id = $1
    `;

    if (className) {
      params.push(className);
      query += ` and lm.class_name = $${params.length}`;
    }
    if (subjectName) {
      params.push(subjectName);
      query += ` and lm.subject_name = $${params.length}`;
    }
    if (semester) {
      params.push(semester);
      query += ` and lm.semester = $${params.length}`;
    }

    query += ' order by lm.created_at desc, lm.id desc';

    const res = await this.pool.query(query, params);
    return res.rows;
  }

  async findForStudent(studentId: string, subjectName?: string, semester?: string) {
    await this.ensureLearningMaterialsTable();

    const className = await this.findStudentClassName(studentId);
    if (!className) {
      return [];
    }

    const params: any[] = [className];
    let query = this.baseVisibleMaterialsQuery('lm.class_name = $1');

    if (subjectName) {
      params.push(subjectName);
      query += ` and lm.subject_name = $${params.length}`;
    }
    if (semester) {
      params.push(semester);
      query += ` and lm.semester = $${params.length}`;
    }

    query += ' order by lm.created_at desc, lm.week_number nulls last, lm.id desc';

    const res = await this.pool.query(query, params);
    return res.rows;
  }

  async findForParent(parentUserId: number, studentId?: string, subjectName?: string, semester?: string) {
    await this.ensureLearningMaterialsTable();

    const studentIdsRes = await this.pool.query(
      `
        select ps.student_id as "studentId"
        from parents p
        join parent_students ps on p.parent_id = ps.parent_id
        where p.user_id = $1
        order by ps.is_primary desc nulls last, ps.student_id asc
      `,
      [parentUserId],
    );

    const allowedStudentIds = studentIdsRes.rows.map((row) => row.studentId);
    if (allowedStudentIds.length === 0) {
      return [];
    }

    const targetStudentId = studentId || allowedStudentIds[0];
    if (!allowedStudentIds.includes(targetStudentId)) {
      throw new BadRequestException('Student does not belong to this parent account');
    }

    return this.findForStudent(targetStudentId, subjectName, semester);
  }

  async createForTeacher(payload: CreateLearningMaterialRequest) {
    await this.ensureLearningMaterialsTable();

    const teacherRes = await this.pool.query(
      'select teacher_id, full_name from teachers where user_id = $1',
      [payload.userId],
    );
    if (!teacherRes.rowCount || teacherRes.rowCount === 0) {
      throw new NotFoundException('Teacher profile not found');
    }

    const teacher = teacherRes.rows[0];
    await this.assertTeacherCanManageClassSubject(
      teacher.teacher_id,
      payload.className,
      payload.subjectName,
    );

    const insertRes = await this.pool.query(
      `
        insert into learning_materials (
          class_name, subject_name, semester, title, description,
          material_type, resource_url, week_number, teacher_id
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        returning id,
                  class_name as "className",
                  subject_name as "subjectName",
                  semester,
                  title,
                  description,
                  material_type as "materialType",
                  resource_url as "resourceUrl",
                  week_number as "weekNumber",
                  created_at as "createdAt"
      `,
      [
        payload.className,
        payload.subjectName,
        payload.semester,
        payload.title,
        payload.description || null,
        payload.materialType,
        payload.resourceUrl,
        payload.weekNumber || null,
        teacher.teacher_id,
      ],
    );

    const material = {
      ...insertRes.rows[0],
      teacherName: teacher.full_name,
    };

    await this.notifyClassAboutNewMaterial(material);
    return material;
  }

  saveUploadedFile(file: any) {
    if (!file?.buffer || !file?.originalname) {
      throw new BadRequestException('File is required');
    }

    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true });
    }

    const safeOriginalName = file.originalname
      .replace(/[^\w.\-]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const fileName = `${Date.now()}-${safeOriginalName || 'learning-material'}`;
    const filePath = join(this.uploadDir, fileName);
    writeFileSync(filePath, file.buffer);

    return {
      fileName,
      originalName: file.originalname,
      resourceUrl: `/learning-materials/files/${encodeURIComponent(fileName)}`,
    };
  }

  getUploadedFilePath(fileName: string) {
    const decodedName = decodeURIComponent(fileName);
    const filePath = resolve(this.uploadDir, decodedName);
    if (!filePath.startsWith(this.uploadDir) || !existsSync(filePath)) {
      throw new NotFoundException('File not found');
    }
    return filePath;
  }

  private baseVisibleMaterialsQuery(whereClause: string): string {
    return `
      select lm.id,
             lm.class_name as "className",
             lm.subject_name as "subjectName",
             lm.semester,
             lm.title,
             lm.description,
             lm.material_type as "materialType",
             lm.resource_url as "resourceUrl",
             lm.week_number as "weekNumber",
             t.full_name as "teacherName",
             lm.created_at as "createdAt"
      from learning_materials lm
      join teachers t on lm.teacher_id = t.teacher_id
      where ${whereClause}
    `;
  }

  private async findStudentClassName(studentId: string): Promise<string | null> {
    const res = await this.pool.query(
      `
        select class_name as "className"
        from student_attendances
        where student_id = $1 and class_name is not null
        order by study_date desc nulls last
        limit 1
      `,
      [studentId],
    );

    return res.rows[0]?.className || null;
  }

  private async assertTeacherCanManageClassSubject(
    teacherId: number,
    className: string,
    subjectName: string,
  ): Promise<void> {
    const res = await this.pool.query(
      `
        select 1
        from teacher_classes
        where teacher_id = $1
          and class_name = $2
          and subject_name = $3
        limit 1
      `,
      [teacherId, className, subjectName],
    );

    if (!res.rowCount || res.rowCount === 0) {
      throw new BadRequestException('Teacher is not assigned to this class and subject');
    }
  }

  private async notifyClassAboutNewMaterial(material: any): Promise<void> {
    const title = `Tài liệu mới môn ${material.subjectName}`;
    const content = `${material.className} có tài liệu mới: ${material.title}`;

    const recipientsRes = await this.pool.query(
      `
        select distinct s.user_id as "userId", 'Student' as role
        from students s
        join student_attendances sa on s.student_id = sa.student_id
        where sa.class_name = $1 and s.user_id is not null

        union

        select distinct p.user_id as "userId", 'Parent' as role
        from parents p
        join parent_students ps on p.parent_id = ps.parent_id
        join student_attendances sa on ps.student_id = sa.student_id
        where sa.class_name = $1 and p.user_id is not null
      `,
      [material.className],
    );

    for (const recipient of recipientsRes.rows) {
      const notifResult = await this.pool.query(
        `
          insert into app_notifications (user_id, role, class_name, title, content)
          values ($1, $2, $3, $4, $5)
          returning id, user_id, role, class_name, title, content, created_at
        `,
        [recipient.userId, recipient.role, material.className, title, content],
      );
      const row = notifResult.rows[0];
      this.gateway.emitNotification(recipient.userId, recipient.role, {
        id: row.id,
        userId: row.user_id,
        role: row.role,
        title: row.title,
        content: row.content,
        className: row.class_name || 'Chung',
        createdAt: row.created_at,
      });
    }
  }

  private async ensureLearningMaterialsTable(): Promise<void> {
    await this.pool.query(`
      create table if not exists learning_materials (
        id serial primary key,
        class_name varchar(100) not null,
        subject_name varchar(100) not null,
        semester varchar(100) not null,
        title varchar(255) not null,
        description text null,
        material_type varchar(30) not null,
        resource_url text not null,
        week_number integer null,
        teacher_id integer not null,
        created_at timestamp not null default now()
      );

      create index if not exists idx_learning_materials_class_subject
        on learning_materials(class_name, subject_name, semester);

      create index if not exists idx_learning_materials_teacher
        on learning_materials(teacher_id);
    `);
  }
}
