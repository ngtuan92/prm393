import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('teacher_requests')
export class TeacherRequest {
  @PrimaryGeneratedColumn({ name: 'request_id' })
  requestId!: number;

  @Column({ name: 'teacher_id' })
  teacherId!: number;

  @Column({ name: 'request_type' })
  requestType!: string;

  @Column()
  title!: string;

  @Column()
  content!: string;

  @Column({ nullable: true })
  status!: string | null;

  @Column({ name: 'created_at', type: 'timestamp', nullable: true })
  createdAt!: Date | null;

  @Column({ name: 'updated_at', type: 'timestamp', nullable: true })
  updatedAt!: Date | null;
}
