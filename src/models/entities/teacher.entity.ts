import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('teachers')
export class Teacher {
  @PrimaryGeneratedColumn({ name: 'teacher_id' })
  teacherId!: number;

  @Column({ name: 'user_id', nullable: true })
  userId!: number | null;

  @Column({ name: 'teacher_code', unique: true })
  teacherCode!: string;

  @Column({ name: 'full_name' })
  fullName!: string;

  @Column({ nullable: true })
  gender!: string | null;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth!: Date | null;

  @Column({ nullable: true })
  department!: string | null;

  @Column({ name: 'homeroom_class', nullable: true })
  homeroomClass!: string | null;

  @Column({ name: 'created_at', type: 'timestamp', nullable: true })
  createdAt!: Date | null;

  @OneToOne(() => User, (user) => user.teacher)
  @JoinColumn({ name: 'user_id' })
  user!: User | null;
}
