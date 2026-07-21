import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class LoginRequest {
  @ApiProperty({ example: '0912345678' })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiProperty({ example: 'Student@123' })
  @IsString()
  @Length(6, 64)
  password!: string;
}
