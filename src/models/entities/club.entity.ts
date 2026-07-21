import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('clubs')
export class Club {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'club_name' })
  clubName!: string;

  @Column({ nullable: true })
  description!: string | null;

  @Column({ name: 'icon_name', nullable: true })
  iconName!: string | null;

  @Column({ name: 'color_hex', nullable: true })
  colorHex!: string | null;
}
