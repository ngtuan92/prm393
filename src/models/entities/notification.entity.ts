import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'teacher_id', nullable: true })
  teacherId!: number | null;

  @Column({ name: 'class_name' })
  className!: string;

  @Column()
  title!: string;

  @Column()
  content!: string;

  @Column({ name: 'created_at', type: 'timestamp', nullable: true })
  createdAt!: Date | null;
}
