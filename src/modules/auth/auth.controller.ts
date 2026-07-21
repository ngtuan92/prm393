import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ForgotPasswordRequest } from '../../models/requests/forgot-password.request';
import { LoginRequest } from '../../models/requests/login.request';
import { ResetPasswordRequest } from '../../models/requests/reset-password.request';
import { LoginResponse, MessageResponse } from '../../models/responses/auth.response';
import { AuthService } from './auth.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with phone and password' })
  @ApiOkResponse({ type: LoginResponse })
  login(@Body() payload: LoginRequest): Promise<LoginResponse> {
    return this.authService.login(payload);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send password reset OTP to user email' })
  @ApiOkResponse({ type: MessageResponse })
  async forgotPassword(
    @Body() payload: ForgotPasswordRequest,
  ): Promise<MessageResponse> {
    await this.authService.requestPasswordReset(payload.email);
    return { message: 'Password reset OTP has been sent to user email' };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with email OTP' })
  @ApiOkResponse({ type: MessageResponse })
  async resetPassword(
    @Body() payload: ResetPasswordRequest,
  ): Promise<MessageResponse> {
    await this.authService.resetPassword(payload);
    return { message: 'Password has been reset successfully' };
  }
}
