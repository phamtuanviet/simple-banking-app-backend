import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { User } from './user.entity';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { OtpVerification } from '../transaction/entities/otp-verification.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { MailService } from '../mail/mail.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import * as bcrypt from 'bcrypt';
import { InitiateChangeEmailDto } from './dto/initiate-change-email.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(OtpVerification)
    private readonly otpRepo: Repository<OtpVerification>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    private readonly cloudinaryService: CloudinaryService, // Inject service
    private readonly mailService: MailService,
  ) {}

  private readonly MAX_OTP_ATTEMPTS = 3;
  private readonly MAX_OTP_RESENDS = 3;
  private readonly OTP_COOLDOWN_MS = 60 * 1000;
  async updateProfile(userId: string, updateData: UpdateProfileDto) {
    try {
      await this.userRepo.update(userId, updateData);
      return {
        success: true,
        message: 'Cập nhật thông tin cá nhân thành công',
      };
    } catch (error) {
      // Bắt lỗi trùng số điện thoại (nếu DB báo lỗi unique constraint vi phạm)
      if (error.code === '23505' && error.detail.includes('phone_number')) {
        throw new BadRequestException('Số điện thoại này đã được sử dụng.');
      }
      throw new InternalServerErrorException(
        'Lỗi hệ thống khi cập nhật thông tin.',
      );
    }
  }

  // 2. CẬP NHẬT AVATAR & XÓA ẢNH CŨ
  async updateAvatar(userId: string, file: Express.Multer.File) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('Người dùng không tồn tại');

    // Lưu lại URL cũ để lát nữa xóa
    const oldAvatarUrl = user.avatarUrl;

    try {
      // 1. Upload ảnh mới lên Cloudinary
      const uploadResult = await this.cloudinaryService.uploadFile(file);
      const newAvatarUrl = uploadResult.secure_url;

      // 2. Lưu URL mới vào Database
      await this.userRepo.update(userId, { avatarUrl: newAvatarUrl });

      // 3. Xóa ảnh cũ trên Cloudinary (Chạy ngầm, không dùng await chặn luồng chính)
      if (oldAvatarUrl && oldAvatarUrl.includes('cloudinary.com')) {
        this.deleteOldAvatar(oldAvatarUrl).catch((err) =>
          console.error(`Không thể xóa avatar cũ: ${oldAvatarUrl}`, err),
        );
      }

      return {
        success: true,
        message: 'Cập nhật ảnh đại diện thành công',
        avatarUrl: newAvatarUrl,
      };
    } catch (_error) {
      throw new InternalServerErrorException('Lỗi hệ thống khi tải ảnh lên.');
    }
  }

  // Hàm tiện ích: Trích xuất public_id từ URL và gọi lệnh xóa
  private async deleteOldAvatar(url: string) {
    // URL có dạng: https://res.cloudinary.com/.../simple_banking_avatars/xyz.jpg
    const parts = url.split('/');
    const fileWithExtension = parts.pop(); // Lấy "xyz.jpg"
    const folder = parts.pop(); // Lấy "simple_banking_avatars"

    if (fileWithExtension && folder) {
      const filename = fileWithExtension.split('.')[0]; // Lấy "xyz"
      const publicId = `${folder}/${filename}`;
      await this.cloudinaryService.deleteFile(publicId);
    }
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('Tài khoản không tồn tại');

    const isPasswordValid = await bcrypt.compare(
      dto.oldPassword,
      user.passwordHash,
    );
    if (!isPasswordValid)
      throw new BadRequestException('Mật khẩu hiện tại không chính xác');

    const isSameAsOld = await bcrypt.compare(
      dto.newPassword,
      user.passwordHash,
    );
    if (isSameAsOld)
      throw new BadRequestException(
        'Mật khẩu mới không được trùng với mật khẩu cũ',
      );

    // 1. Lưu mật khẩu mới
    user.passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.userRepo.save(user);

    // 2. [QUAN TRỌNG] Xóa toàn bộ Refresh Token của user này để ép đăng xuất ở mọi nơi
    await this.refreshTokenRepo.delete({ user: { id: userId } });

    // 3. Gửi cảnh báo
    await this.mailService.sendSecurityAlert(
      user.email,
      'Thay đổi mật khẩu thành công',
      'Mật khẩu của bạn vừa được thay đổi. Tất cả các thiết bị khác đã bị đăng xuất.',
    );

    return {
      success: true,
      message:
        'Đổi mật khẩu thành công. Vui lòng đăng nhập lại trên các thiết bị khác.',
    };
  }

  // ==========================================
  // 2. BƯỚC 1: YÊU CẦU ĐỔI EMAIL
  // ==========================================
  async initiateChangeEmail(userId: string, dto: InitiateChangeEmailDto) {
    const user = await this.userRepo.findOne({ where: { id: userId } });

    if (!user) throw new NotFoundException('Người dùng không tồn tại');

    const isPasswordValid = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!isPasswordValid)
      throw new BadRequestException('Mật khẩu xác thực không chính xác');

    if (dto.newEmail === user.email) {
      throw new BadRequestException('Email mới phải khác email hiện tại');
    }

    const emailExists = await this.userRepo.findOne({
      where: { email: dto.newEmail },
    });
    if (emailExists) throw new BadRequestException('Email này đã được sử dụng');

    // Dọn dẹp OTP đổi email cũ (transaction = null)
    await this.otpRepo.delete({ transaction: IsNull(), user: { id: userId } });

    const plainOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 phút

    const otpRecord = this.otpRepo.create({
      user: user,
      otpHash: await bcrypt.hash(plainOtp, 10),
      expiresAt: expiresAt,
      metadata: dto.newEmail, // Trú ẩn email mới
      failedAttempts: 0,
      resendCount: 0,
    });
    await this.otpRepo.save(otpRecord);

    await this.mailService.sendOtpEmail(
      dto.newEmail,
      plainOtp,
      0,
      '',
      user.fullName,
    );

    return {
      success: true,
      status: 'PENDING_OTP',
      message: 'Mã OTP đã được gửi đến email mới',
    };
  }

  // ==========================================
  // 3. GỬI LẠI OTP ĐỔI EMAIL (CÓ GIỚI HẠN)
  // ==========================================
  async resendChangeEmailOtp(userId: string) {
    const otpRecord = await this.otpRepo.findOne({
      where: { user: { id: userId }, transaction: IsNull() },
    });

    if (!otpRecord)
      throw new BadRequestException(
        'Không tìm thấy yêu cầu đổi email đang xử lý.',
      );

    // 1. Kiểm tra giới hạn số lần gửi lại (Max 3 lần)
    if (otpRecord.resendCount >= this.MAX_OTP_RESENDS) {
      await this.otpRepo.delete(otpRecord.id);
      throw new BadRequestException(
        'Bạn đã vượt quá số lần gửi lại OTP. Yêu cầu đổi email đã bị hủy.',
      );
    }

    // 2. Kiểm tra Cooldown (Chống Spam API 60s)
    const now = Date.now();
    const lastUpdate = new Date(
      otpRecord.updatedAt || otpRecord.createdAt,
    ).getTime();
    if (now - lastUpdate < this.OTP_COOLDOWN_MS) {
      const secondsLeft = Math.ceil(
        (this.OTP_COOLDOWN_MS - (now - lastUpdate)) / 1000,
      );
      throw new BadRequestException(
        `Vui lòng đợi ${secondsLeft} giây trước khi gửi lại.`,
      );
    }

    // 3. Sinh mã OTP mới
    const plainOtp = Math.floor(100000 + Math.random() * 900000).toString();
    otpRecord.otpHash = await bcrypt.hash(plainOtp, 10);
    otpRecord.expiresAt = new Date(Date.now() + 5 * 60 * 1000); // Reset lại 5 phút
    otpRecord.failedAttempts = 0; // Reset số lần nhập sai
    otpRecord.resendCount += 1; // Tăng biến đếm resend

    await this.otpRepo.save(otpRecord);

    // Lấy email mới đang cất trong metadata để gửi lại
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('Không tìm thấy người dùng'); // Thêm dòng này

    await this.mailService.sendOtpEmail(
      otpRecord.metadata as string,
      plainOtp,
      0,
      '',
      user.fullName,
    );

    return {
      success: true,
      message: `Đã gửi lại OTP. Bạn còn ${this.MAX_OTP_RESENDS - otpRecord.resendCount} lần gửi lại.`,
    };
  }

  // ==========================================
  // 4. BƯỚC 2: XÁC NHẬN OTP ĐỂ ĐỔI EMAIL
  // ==========================================
  async confirmChangeEmail(userId: string, otpCode: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });

    if (!user) throw new BadRequestException('Người dùng không tồn tại');
    const oldEmail = user.email;

    const otpRecord = await this.otpRepo.findOne({
      where: { user: { id: userId }, transaction: IsNull() },
    });

    if (!otpRecord)
      throw new BadRequestException('Không tìm thấy yêu cầu đổi email');

    // 1. Kiểm tra hết hạn
    if (new Date() > otpRecord.expiresAt) {
      await this.otpRepo.delete(otpRecord.id);
      throw new BadRequestException(
        'Mã OTP đã hết hạn. Vui lòng thực hiện lại.',
      );
    }

    // 2. Xác thực OTP
    const isValidOtp = await bcrypt.compare(otpCode, otpRecord.otpHash);
    if (!isValidOtp) {
      otpRecord.failedAttempts += 1;
      await this.otpRepo.save(otpRecord);

      if (otpRecord.failedAttempts >= this.MAX_OTP_ATTEMPTS) {
        await this.otpRepo.delete(otpRecord.id);
        throw new BadRequestException(
          'Nhập sai OTP quá 3 lần. Yêu cầu đổi email đã bị hủy.',
        );
      }
      throw new BadRequestException(
        `Mã OTP không chính xác. Bạn còn ${this.MAX_OTP_ATTEMPTS - otpRecord.failedAttempts} lần thử.`,
      );
    }

    // 3. Thành công -> Đổi email
    const newEmail = otpRecord.metadata as string;
    user.email = newEmail;
    await this.userRepo.save(user);
    await this.otpRepo.delete(otpRecord.id);

    // 4. Gửi email cảnh báo về email CŨ
    await this.mailService.sendSecurityAlert(
      oldEmail,
      'Cảnh báo: Email tài khoản đã thay đổi',
      `Tài khoản của bạn vừa được đổi sang email mới (${newEmail}). Nếu bạn không thực hiện việc này, hãy liên hệ CSKH ngay lập tức.`,
    );

    return { success: true, message: 'Đổi địa chỉ email thành công' };
  }
}
