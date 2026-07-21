import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('parents')
export class Parent {
  @PrimaryGeneratedColumn({ name: 'parent_id' })
  parentId!: number;

  @Column({ name: 'user_id', nullable: true })
  userId!: number | null;

  @Column({ name: 'full_name' })
  fullName!: string;

  @Column({ nullable: true })
  gender!: string | null;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth!: Date | null;

  @Column({ nullable: true })
  address!: string | null;

  @Column({ name: 'created_at', type: 'timestamp', nullable: true })
  createdAt!: Date | null;

  @OneToOne(() => User, (user) => user.parent)
  @JoinColumn({ name: 'user_id' })
  user!: User | null;
}
