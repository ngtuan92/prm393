import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('parent_students')
export class ParentStudent {
  @PrimaryGeneratedColumn({ name: 'parent_student_id' })
  parentStudentId!: number;

  @Column({ name: 'parent_id' })
  parentId!: number;

  @Column({ name: 'student_id' })
  studentId!: string;

  @Column({ nullable: true })
  relationship!: string | null;

  @Column({ name: 'is_primary', nullable: true })
  isPrimary!: boolean | null;
}
