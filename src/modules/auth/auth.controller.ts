import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  BadRequestException,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { ResendEmailDto } from './dto/resend-email.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import type { Request, Response } from 'express';

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
  async login(
    @Body() loginDto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ipAddress = request.ip;
    const userAgent = request.headers['user-agent'] || '';

    const result = await this.authService.login(loginDto, ipAddress, userAgent);

    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true, // Trình duyệt không thể đọc bằng JS (Chống XSS)
      secure: process.env.NODE_ENV === 'production', // Chỉ gửi qua HTTPS khi lên Production
      sameSite: 'lax', // Bảo vệ khỏi tấn công CSRF
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 ngày (Tính bằng mili-giây)
    });

    return {
      message: result.message,
      user: result.user,
      accessToken: result.accessToken,
    };
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
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    // Lấy IP và User Agent để lưu vào DB, giúp Admin và User biết thiết bị nào đang đăng nhập
    const oldRefreshToken = request.cookies['refreshToken'];

    if (!oldRefreshToken) {
      throw new UnauthorizedException('Không tìm thấy phiên đăng nhập');
    }
    const ipAddress = request.ip;
    const userAgent = request.headers['user-agent'] || '';

    const result = await this.authService.refreshToken(
      oldRefreshToken, // Truyền thẳng chuỗi string, không cần DTO nữa
      ipAddress,
      userAgent,
    );
    response.cookie('refreshToken', result.newRefreshTokenString, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 ngày
    });
    return {
      message: 'Làm mới phiên đăng nhập thành công',
      accessToken: result.newAccessToken,
    };
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies['refreshToken'];

    if (refreshToken) {
      // 1. Xóa hoặc vô hiệu hóa token trong Database
      await this.authService.logout(refreshToken);

      // 2. Ra lệnh cho trình duyệt XÓA cookie này đi
      res.clearCookie('refreshToken', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });
    }

    return { message: 'Đăng xuất thành công' };
  }
}
