import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('teacher_grade_imports')
export class TeacherGradeImport {
  @PrimaryGeneratedColumn({ name: 'grade_import_id' })
  gradeImportId!: number;

  @Column({ name: 'teacher_id' })
  teacherId!: number;

  @Column({ name: 'class_name' })
  className!: string;

  @Column({ name: 'subject_name' })
  subjectName!: string;

  @Column({ name: 'component_name' })
  componentName!: string;

  @Column()
  semester!: string;

  @Column()
  status!: string;

  @Column({ name: 'imported_at', type: 'timestamp', nullable: true })
  importedAt!: Date | null;

  @Column({ name: 'source_file', nullable: true })
  sourceFile!: string | null;
}
