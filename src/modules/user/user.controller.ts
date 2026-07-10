import {
  BadRequestException,
  Body,
  Controller,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { User } from './user.entity';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserService } from './user.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ConfirmChangeEmailDto } from './dto/confirm-change-email.dto';
import { InitiateChangeEmailDto } from './dto/initiate-change-email.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@Controller('user')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Patch('profile')
  async updateProfile(
    @CurrentUser() user: User,
    @Body() updateData: UpdateProfileDto,
  ) {
    // Không cho phép update các trường rỗng hoàn toàn nếu họ gửi lên object rỗng
    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('Không có dữ liệu để cập nhật');
    }
    return this.userService.updateProfile(user.id, updateData);
  }

  @Post('avatar')
  @UseInterceptors(FileInterceptor('file')) // Bắt trường 'file' từ FormData
  async uploadAvatar(
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn file ảnh.');
    }

    // Giới hạn 5MB
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('Ảnh không được vượt quá 5MB.');
    }

    // Kiểm tra định dạng (Chỉ nhận ảnh)
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('File tải lên phải là định dạng hình ảnh.');
    }

    return this.userService.updateAvatar(user.id, file);
  }

  @Post('change-password')
  async changePassword(
    @CurrentUser() user: User,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.userService.changePassword(user.id, dto);
  }

  @Post('change-email/initiate')
  async initiateChangeEmail(
    @CurrentUser() user: User,
    @Body() dto: InitiateChangeEmailDto,
  ) {
    return this.userService.initiateChangeEmail(user.id, dto);
  }

  // [THÊM MỚI] Endpoint gửi lại mã OTP
  @Post('change-email/resend-otp')
  async resendChangeEmailOtp(@CurrentUser() user: User) {
    return this.userService.resendChangeEmailOtp(user.id);
  }

  @Post('change-email/confirm')
  async confirmChangeEmail(
    @CurrentUser() user: User,
    @Body() dto: ConfirmChangeEmailDto,
  ) {
    return this.userService.confirmChangeEmail(user.id, dto.otpCode);
  }
}
