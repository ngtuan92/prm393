import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('requests')
export class Request {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'student_id', nullable: true })
  studentId!: number | null;

  @Column({ name: 'teacher_id', nullable: true })
  teacherId!: number | null;

  @Column({ name: 'user_id', nullable: true })
  userId!: number | null;

  @Column({ nullable: true })
  role!: string | null;

  @Column({ name: 'actor_profile_id', nullable: true })
  actorProfileId!: number | null;

  @Column()
  title!: string;

  @Column()
  type!: string;

  @Column()
  content!: string;

  @Column({ nullable: true })
  status!: string | null;

  @Column({ name: 'receiver_name', nullable: true })
  receiverName!: string | null;

  @Column({ name: 'created_at', type: 'timestamp', nullable: true })
  createdAt!: Date | null;

  @Column({ name: 'updated_at', type: 'timestamp', nullable: true })
  updatedAt!: Date | null;
}
