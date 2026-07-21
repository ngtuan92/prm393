import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('teacher_schedules')
export class TeacherSchedule {
  @PrimaryGeneratedColumn({ name: 'schedule_id' })
  scheduleId!: number;

  @Column({ name: 'teacher_id' })
  teacherId!: number;

  @Column({ name: 'class_name' })
  className!: string;

  @Column({ name: 'subject_name' })
  subjectName!: string;

  @Column()
  semester!: string;

  @Column({ name: 'day_of_week' })
  dayOfWeek!: string;

  @Column({ name: 'slot_name', nullable: true })
  slotName!: string | null;

  @Column({ name: 'start_time', type: 'time' })
  startTime!: string;

  @Column({ name: 'end_time', type: 'time' })
  endTime!: string;

  @Column({ nullable: true })
  room!: string | null;
}
