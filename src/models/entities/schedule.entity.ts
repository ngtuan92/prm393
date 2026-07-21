import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('schedules')
export class Schedule {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'student_id', nullable: true })
  studentId!: string | null;

  @Column({ name: 'subject_name' })
  subjectName!: string;

  @Column()
  room!: string;

  @Column({ name: 'day_of_week' })
  dayOfWeek!: string;

  @Column({ name: 'start_time', type: 'time' })
  startTime!: string;

  @Column()
  semester!: string;
}
