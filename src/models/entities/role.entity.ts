import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { UserRole } from '../enums/user-role.enum';
import { User } from './user.entity';

@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  name!: UserRole;

  @Column({ nullable: true })
  description!: string | null;

  @OneToMany(() => User, (user) => user.role)
  users!: User[];
}
