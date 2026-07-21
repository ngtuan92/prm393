import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('discipline_logs')
export class DisciplineLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'student_id' })
  studentId!: string;

  @Column({ name: 'class_name' })
  className!: string;

  @Column({ name: 'violation_type' })
  violationType!: string;

  @Column({ nullable: true })
  description!: string | null;

  @Column({ name: 'image_url', nullable: true })
  imageUrl!: string | null;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @Column({ name: 'logged_by', nullable: true })
  loggedBy!: string | null;
}
