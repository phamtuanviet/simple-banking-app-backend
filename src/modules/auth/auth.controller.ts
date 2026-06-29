import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { ResendEmailDto } from './dto/resend-email.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import type { Request } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('resend-verification')
  async resendVerification(@Body() resendDto: ResendEmailDto) {
    return this.authService.resendVerificationEmail(resendDto);
  }

  @Get('verify-email')
  async verifyEmail(@Query('token') token: string) {
    if (!token) {
      throw new BadRequestException('Thiếu mã xác nhận.');
    }
    return this.authService.verifyEmail(token);
  }

  @Post('login')
  async login(@Body() loginDto: LoginDto, @Req() request: Request) {
    const ipAddress = request.ip;
    const userAgent = request.headers['user-agent'] || '';
    return this.authService.login(loginDto, ipAddress, userAgent);
  }

  @Post('forgot-password')
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Post('reset-password')
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  @Post('refresh-token')
  async refreshToken(
    @Body() refreshTokenDto: RefreshTokenDto,
    @Req() request: Request,
  ) {
    // Lấy IP và User Agent để lưu vào DB, giúp Admin và User biết thiết bị nào đang đăng nhập
    const ipAddress = request.ip;
    const userAgent = request.headers['user-agent'] || '';

    return this.authService.refreshToken(refreshTokenDto, ipAddress, userAgent);
  }
}
