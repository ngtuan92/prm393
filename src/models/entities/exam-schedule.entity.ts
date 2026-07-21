import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('exam_schedules')
export class ExamSchedule {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'class_name' })
  className!: string;

  @Column({ name: 'subject_name' })
  subjectName!: string;

  @Column({ name: 'exam_date', type: 'date' })
  examDate!: string;

  @Column({ name: 'slot_name' })
  slotName!: string;

  @Column()
  room!: string;

  @Column()
  semester!: string;

  @Column({ name: 'teacher_id' })
  teacherId!: number;
}
