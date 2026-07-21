import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('teacher_classes')
export class TeacherClass {
  @PrimaryGeneratedColumn({ name: 'teacher_class_id' })
  teacherClassId!: number;

  @Column({ name: 'teacher_id' })
  teacherId!: number;

  @Column({ name: 'class_name' })
  className!: string;

  @Column({ name: 'subject_name' })
  subjectName!: string;

  @Column()
  semester!: string;

  @Column({ name: 'student_count', nullable: true })
  studentCount!: number | null;
}
