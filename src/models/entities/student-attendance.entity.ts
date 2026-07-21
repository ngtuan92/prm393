import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('student_attendances')
export class StudentAttendance {
  @PrimaryGeneratedColumn({ name: 'attendance_id' })
  attendanceId!: number;

  @Column({ name: 'student_id' })
  studentId!: string;

  @Column({ name: 'subject_name' })
  subjectName!: string;

  @Column({ name: 'class_name', nullable: true })
  className!: string | null;

  @Column({ nullable: true })
  room!: string | null;

  @Column({ name: 'study_date', type: 'date' })
  studyDate!: Date;

  @Column({ name: 'day_of_week', nullable: true })
  dayOfWeek!: string | null;

  @Column({ name: 'slot_name', nullable: true })
  slotName!: string | null;

  @Column({ name: 'start_time', type: 'time', nullable: true })
  startTime!: string | null;

  @Column({ name: 'end_time', type: 'time', nullable: true })
  endTime!: string | null;

  @Column()
  status!: string;

  @Column({ nullable: true })
  note!: string | null;
}
