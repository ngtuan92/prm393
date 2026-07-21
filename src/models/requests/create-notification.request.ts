import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateNotificationRequest {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  userId!: number;

  @ApiProperty({ example: 'Student' })
  @IsString()
  @IsNotEmpty()
  role!: string;

  @ApiProperty({ example: 'Thông báo lịch học' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ example: 'Lớp PRM392 đổi sang phòng AL-R401.' })
  @IsString()
  @IsNotEmpty()
  content!: string;

  @ApiPropertyOptional({ example: 'PRM392' })
  @IsOptional()
  @IsString()
  className?: string;
}
