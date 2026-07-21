import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('tuition_payments')
export class TuitionPayment {
  @PrimaryGeneratedColumn({ name: 'tuition_id' })
  tuitionId!: number;

  @Column({ name: 'student_id' })
  studentId!: string;

  @Column()
  semester!: string;

  @Column({ type: 'decimal' })
  amount!: string;

  @Column()
  status!: string;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate!: Date | null;

  @Column({ name: 'paid_at', type: 'timestamp', nullable: true })
  paidAt!: Date | null;
}
