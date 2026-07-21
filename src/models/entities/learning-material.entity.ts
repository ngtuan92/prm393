import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('learning_materials')
export class LearningMaterial {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'class_name' })
  className!: string;

  @Column({ name: 'subject_name' })
  subjectName!: string;

  @Column()
  semester!: string;

  @Column()
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'material_type' })
  materialType!: string;

  @Column({ name: 'resource_url', type: 'text' })
  resourceUrl!: string;

  @Column({ name: 'week_number', nullable: true })
  weekNumber!: number | null;

  @Column({ name: 'teacher_id' })
  teacherId!: number;

  @Column({ name: 'created_at', type: 'timestamp', nullable: true })
  createdAt!: Date | null;
}
