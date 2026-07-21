import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreateClubRegistrationRequest {
  @Type(() => Number)
  @IsInt()
  userId!: number;

  @IsOptional()
  @IsString()
  studentCode?: string;

  @Type(() => Number)
  @IsInt()
  clubId!: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
