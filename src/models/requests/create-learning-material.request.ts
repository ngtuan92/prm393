import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export const learningMaterialTypes = [
  'LESSON',
  'ASSIGNMENT',
  'HOMEWORK',
  'REVIEW',
  'REFERENCE',
  'VIDEO',
] as const;

export class CreateLearningMaterialRequest {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId!: number;

  @IsString()
  @IsNotEmpty()
  className!: string;

  @IsString()
  @IsNotEmpty()
  subjectName!: string;

  @IsString()
  @IsNotEmpty()
  semester!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsIn(learningMaterialTypes)
  materialType!: string;

  @IsString()
  @IsNotEmpty()
  resourceUrl!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  weekNumber?: number;
}
