import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('students')
export class Student {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'user_id', nullable: true })
  userId!: number | null;

  @Column({ name: 'student_id', unique: true })
  studentId!: string;

  @Column({ name: 'full_name' })
  fullName!: string;

  @Column({ nullable: true })
  gender!: string | null;

  @Column({ type: 'date', nullable: true })
  dob!: string | null;

  @OneToOne(() => User, (user) => user.student)
  @JoinColumn({ name: 'user_id' })
  user!: User | null;
}
