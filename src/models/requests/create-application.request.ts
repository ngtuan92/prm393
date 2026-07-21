import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from '../enums/user-role.enum';

export class CreateApplicationRequest {
  @Type(() => Number)
  @IsInt()
  userId!: number;

  @IsIn([UserRole.Student, UserRole.Teacher, UserRole.Parent, UserRole.Staff])
  role!: UserRole;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsOptional()
  @IsString()
  receiverName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  receiverTeacherId?: number;

  @IsOptional()
  @IsString()
  studentCode?: string;
}
