import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ForgotPasswordRequest {
  @ApiProperty({ example: 'student@fpt.edu.vn' })
  @IsEmail()
  email!: string;
}
