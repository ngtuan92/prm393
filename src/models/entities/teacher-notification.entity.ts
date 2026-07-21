import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('teacher_notifications')
export class TeacherNotification {
  @PrimaryGeneratedColumn({ name: 'notification_id' })
  notificationId!: number;

  @Column({ name: 'teacher_id', nullable: true })
  teacherId!: number | null;

  @Column()
  title!: string;

  @Column()
  content!: string;

  @Column({ name: 'created_at', type: 'timestamp', nullable: true })
  createdAt!: Date | null;

  @Column({ name: 'is_read', nullable: true })
  isRead!: boolean | null;
}
