import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('club_members')
export class ClubMember {
  @PrimaryColumn({ name: 'club_id' })
  clubId!: number;

  @PrimaryColumn({ name: 'student_id' })
  studentId!: number;

  @Column({ name: 'joined_at', type: 'timestamp', nullable: true })
  joinedAt!: Date | null;
}
