import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('grades')
export class Grade {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'student_id', nullable: true })
  studentId!: string | null;

  @Column()
  subject!: string;

  @Column()
  semester!: string;

  @Column({ type: 'decimal' })
  score!: string;

  @Column({ type: 'decimal', nullable: true })
  oral!: string | null;

  @Column({ name: 'fifteen_min', type: 'decimal', nullable: true })
  fifteenMin!: string | null;

  @Column({ type: 'decimal', nullable: true })
  midterm!: string | null;

  @Column({ name: 'final_exam', type: 'decimal', nullable: true })
  finalExam!: string | null;
}
