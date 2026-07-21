import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Parent } from './parent.entity';
import { Role } from './role.entity';
import { Student } from './student.entity';
import { Teacher } from './teacher.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'role_id' })
  roleId!: number;

  @Column({ unique: true })
  email!: string;

  @Column({ unique: true, nullable: true })
  phone!: string | null;

  @Column({ name: 'password_hash' })
  passwordHash!: string;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'now()' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamp', default: () => 'now()' })
  updatedAt!: Date;

  @ManyToOne(() => Role, (role) => role.users)
  @JoinColumn({ name: 'role_id' })
  role!: Role;

  @OneToOne(() => Student, (student) => student.user)
  student!: Student | null;

  @OneToOne(() => Teacher, (teacher) => teacher.user)
  teacher!: Teacher | null;

  @OneToOne(() => Parent, (parent) => parent.user)
  parent!: Parent | null;
}
