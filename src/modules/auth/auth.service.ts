import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto'; // Thư viện có sẵn của Node.js để tạo chuỗi ngẫu nhiên
import { User, UserStatus } from '../user/user.entity';
import { RegisterDto } from './dto/register.dto';
import { MailService } from '../mail/mail.service';
import { ResendEmailDto } from './dto/resend-email.dto';
import { RefreshToken } from './entities/refresh-token.entity';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto, ipAddress?: string, userAgent?: string) {
    const { email, password } = loginDto;
    const user = await this.userRepository.findOne({ where: { email } });

    if (!user) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    // 2. Kiểm tra tài khoản có đang bị khóa (Brute-force protection) không
    if (user.lockoutUntil && user.lockoutUntil > new Date()) {
      const lockMinutes = Math.ceil(
        (user.lockoutUntil.getTime() - new Date().getTime()) / 60000,
      );
      throw new ForbiddenException(
        `Tài khoản đang bị tạm khóa. Vui lòng thử lại sau ${lockMinutes} phút.`,
      );
    }

    // 3. Kiểm tra mật khẩu
    const isPasswordMatch = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordMatch) {
      // Xử lý logic cộng dồn số lần sai
      user.failedLoginAttempts += 1;

      // Nếu sai >= 5 lần -> Khóa 15 phút
      if (user.failedLoginAttempts >= 5) {
        const lockoutDate = new Date();
        lockoutDate.setMinutes(lockoutDate.getMinutes() + 15);
        user.lockoutUntil = lockoutDate;
        await this.userRepository.save(user);
        throw new ForbiddenException(
          'Bạn đã nhập sai quá nhiều lần. Tài khoản bị tạm khóa 15 phút.',
        );
      }

      await this.userRepository.save(user);
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    // 4. Nếu đăng nhập thành công -> Reset lại bộ đếm số lần sai
    if (user.failedLoginAttempts > 0 || user.lockoutUntil) {
      user.failedLoginAttempts = 0;
      user.lockoutUntil = null;
      await this.userRepository.save(user);
    }

    // 5. Kiểm tra email đã xác nhận chưa
    if (!user.isEmailVerified) {
      throw new ForbiddenException(
        'Vui lòng xác nhận địa chỉ email trước khi đăng nhập',
      );
    }

    // 6. Kiểm tra trạng thái Status (Có bị Admin Banned không)
    if (user.status !== UserStatus.ACTIVE) {
      // Giả sử 'active' là Enum UserStatus.ACTIVE
      throw new ForbiddenException(
        'Tài khoản của bạn đã bị khóa hoặc vô hiệu hóa bởi Quản trị viên.',
      );
    }
    // SAU KHI VƯỢT QUA MỌI KIỂM TRA BẢO MẬT -> TIẾN HÀNH SINH TOKEN

    // 1. Tạo Payload (Nội dung) cho Access Token
    const jwtPayload = {
      sub: user.id, // sub là chuẩn chung để lưu User ID
      email: user.email,
      role: user.role,
    };

    // 2. Ký Access Token (Tự động lấy cấu hình từ JwtModule)
    const accessToken = this.jwtService.sign(jwtPayload);

    // 3. Tạo Refresh Token (Chuỗi ngẫu nhiên, không cần dùng JWT cho phần này để dễ kiểm soát)
    const refreshTokenString = crypto.randomBytes(64).toString('hex');

    // 4. Băm Refresh Token để lưu vào DB (Đề phòng DB bị hack cũng không lộ token gốc)
    const hashedRefreshToken = crypto
      .createHash('sha256')
      .update(refreshTokenString)
      .digest('hex');

    // 5. Tính ngày hết hạn của Refresh Token (Ví dụ: 7 ngày)
    const rtExpiresAt = new Date();
    rtExpiresAt.setDate(rtExpiresAt.getDate() + 7);

    // 6. Lưu vào bảng refresh_tokens
    const newSession = this.refreshTokenRepo.create({
      hashedToken: hashedRefreshToken,
      expiresAt: rtExpiresAt,
      ipAddress: ipAddress,
      userAgent: userAgent,
      user: user, // Gắn vào user này
    });
    await this.refreshTokenRepo.save(newSession);

    // 7. Trả kết quả về cho Frontend
    return {
      message: 'Đăng nhập thành công', // Interceptor sẽ bắt chữ này lôi ra ngoài
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
      accessToken: accessToken,
      refreshToken: refreshTokenString, // Trả về chuỗi GỐC chưa băm cho Frontend giữ
    };
  }

  async register(registerDto: RegisterDto) {
    const { email, password, fullName } = registerDto;

    // 1. Kiểm tra xem email đã tồn tại trong DB chưa
    const existingUser = await this.userRepository.findOne({
      where: { email },
    });
    if (existingUser) {
      if (existingUser.isEmailVerified) {
        throw new ConflictException('Email này đã được sử dụng!');
      }

      const now = new Date();
      if (
        existingUser.emailVerificationExpiresAt &&
        existingUser.emailVerificationExpiresAt > now
      ) {
        throw new ConflictException(
          'Email này đang trong quá trình chờ xác thực. Vui lòng kiểm tra hộp thư!',
        );
      }

      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);
      const emailVerificationToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      existingUser.fullName = fullName;
      existingUser.passwordHash = passwordHash;
      existingUser.emailVerificationToken = emailVerificationToken;
      existingUser.emailVerificationExpiresAt = expiresAt;
      existingUser.lastVerificationSentAt = new Date();

      await this.userRepository.save(existingUser);

      this.mailService
        .sendVerificationEmail(existingUser.email, emailVerificationToken)
        .catch((error) => console.error('Lỗi gửi mail tái đăng ký:', error));

      return {
        message:
          'Tài khoản chưa kích hoạt cũ đã được cập nhật. Vui lòng kiểm tra email mới để xác nhận!',
        userId: existingUser.id,
      };
    }

    // 2. Băm mật khẩu (Hash password)
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // 3. Tạo Token xác nhận Email (Mã ngẫu nhiên 64 ký tự)
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');

    // Set thời gian hết hạn cho Token (ví dụ: 24 giờ sau)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // 4. Tạo User mới với các thông tin đã xử lý
    const newUser = this.userRepository.create({
      fullName,
      email,
      passwordHash,
      isEmailVerified: false,
      emailVerificationToken: emailVerificationToken,
      emailVerificationExpiresAt: expiresAt,
      lastVerificationSentAt: new Date(),
    });

    // 5. Lưu vào Database
    await this.userRepository.save(newUser);

    // TODO: GỌI SERVICE GỬI EMAIL Ở ĐÂY
    // await this.mailService.sendVerificationEmail(newUser.email, emailVerificationToken);
    this.mailService
      .sendVerificationEmail(newUser.email, emailVerificationToken)
      .catch((error) => console.error('Lỗi gửi mail ngầm (Register):', error));

    // Trả về kết quả (Tuyệt đối không trả về passwordHash)
    return {
      message:
        'Đăng ký thành công! Vui lòng kiểm tra email để xác nhận tài khoản.',
      userId: newUser.id,
    };
  }

  async resendVerificationEmail(resendDto: ResendEmailDto) {
    const { email } = resendDto;
    const user = await this.userRepository.findOne({ where: { email } });

    // Bảo mật: Nếu user không tồn tại, vẫn trả về thông báo thành công để tránh bị Hacker dò quét email
    if (!user) {
      return {
        success: true,
        message: 'Nếu email tồn tại, link xác nhận đã được gửi.',
      };
    }

    if (user.isEmailVerified) {
      throw new BadRequestException(
        'Tài khoản này đã được xác nhận. Vui lòng đăng nhập.',
      );
    }

    // Xử lý Cooldown 1 phút (60,000 milliseconds)
    if (user.lastVerificationSentAt) {
      const now = new Date().getTime();
      const lastSent = user.lastVerificationSentAt.getTime();
      const timeDiff = now - lastSent;

      if (timeDiff < 60000) {
        throw new BadRequestException(
          'Vui lòng đợi 1 phút trước khi yêu cầu gửi lại email.',
        );
      }
    }

    // Tạo token mới để an toàn hơn
    const newToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // Cập nhật token và thời gian gửi mail mới nhất vào DB
    user.emailVerificationToken = newToken;
    user.emailVerificationExpiresAt = expiresAt;
    user.lastVerificationSentAt = new Date();

    await this.userRepository.save(user);

    // Tiếp tục Fire-and-forget
    this.mailService
      .sendVerificationEmail(user.email, newToken)
      .catch((error) => console.error('Lỗi gửi mail ngầm (Resend):', error));

    return {
      success: true,
      message: 'Đã gửi lại email xác nhận mới.',
    };
  }

  async verifyEmail(token: string) {
    // Tìm user đang sở hữu token này
    const user = await this.userRepository.findOne({
      where: { emailVerificationToken: token },
    });

    if (!user) {
      throw new BadRequestException(
        'Mã xác nhận không hợp lệ hoặc tài khoản không tồn tại.',
      );
    }

    // Kiểm tra xem token đã hết hạn chưa
    if (
      user.emailVerificationExpiresAt &&
      user.emailVerificationExpiresAt < new Date()
    ) {
      throw new BadRequestException(
        'Mã xác nhận đã hết hạn. Vui lòng yêu cầu gửi lại email mới.',
      );
    }

    // Nếu mọi thứ OK -> Cập nhật trạng thái
    user.isEmailVerified = true;

    // Dọn dẹp token cũ để không bị dùng lại
    user.emailVerificationToken = null;
    user.emailVerificationExpiresAt = null;

    await this.userRepository.save(user);

    return {
      success: true,
      message:
        'Xác nhận địa chỉ email thành công. Bây giờ bạn có thể đăng nhập.',
    };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { email } = forgotPasswordDto;
    const user = await this.userRepository.findOne({ where: { email } });

    // Dù user có tồn tại hay không, vẫn trả về chung 1 câu thông báo (Bảo mật chống dò Email)
    const successMessage =
      'Nếu email của bạn tồn tại trên hệ thống, một đường dẫn đặt lại mật khẩu đã được gửi đến hộp thư.';

    if (!user) {
      return { success: true, message: successMessage };
    }

    // Nếu user tồn tại, tạo Token ngẫu nhiên
    const resetToken = crypto.randomBytes(32).toString('hex');

    // Cài đặt thời gian hết hạn là 15 phút
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);

    // Lưu Token vào Database
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpiresAt = expiresAt;
    await this.userRepository.save(user);

    // Gửi email (Fire-and-Forget)
    this.mailService
      .sendPasswordResetEmail(user.email, resetToken)
      .catch((error) => console.error('Lỗi gửi mail Reset Password:', error));

    return {
      success: true,
      message: successMessage,
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { token, newPassword } = resetPasswordDto;

    // Tìm user đang giữ cái token này
    const user = await this.userRepository.findOne({
      where: { resetPasswordToken: token },
    });

    // Báo lỗi nếu token sai hoặc tài khoản không tồn tại
    if (!user) {
      throw new BadRequestException(
        'Đường dẫn không hợp lệ hoặc đã bị thay đổi.',
      );
    }

    // Báo lỗi nếu quá 15 phút (Token hết hạn)
    if (
      user.resetPasswordExpiresAt &&
      user.resetPasswordExpiresAt < new Date()
    ) {
      throw new BadRequestException(
        'Đường dẫn đặt lại mật khẩu đã hết hạn. Vui lòng yêu cầu gửi lại.',
      );
    }

    // Nếu hợp lệ: Băm mật khẩu mới
    const passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordHash = passwordHash;

    // Xóa sạch Token và Hạn sử dụng sau khi đổi xong
    user.resetPasswordToken = null;
    user.resetPasswordExpiresAt = null;

    // (Nâng cao) Reset luôn số lần nhập sai pass nếu tài khoản đang bị khóa do Brute-force
    user.failedLoginAttempts = 0;
    user.lockoutUntil = null;

    await this.userRepository.save(user);

    return {
      success: true,
      message:
        'Đặt lại mật khẩu thành công. Bây giờ bạn có thể đăng nhập bằng mật khẩu mới.',
    };
  }

  async refreshToken(
    oldRefreshTokenString: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    // 1. Băm token user gửi lên bằng đúng thuật toán SHA-256 để tìm trong DB
    const hashedToken = crypto
      .createHash('sha256')
      .update(oldRefreshTokenString)
      .digest('hex');

    // 2. Tìm Session chứa token này (Join với bảng User để lấy data)
    const session = await this.refreshTokenRepo.findOne({
      where: { hashedToken },
      relations: {
        user: true,
      },
    });

    // Nếu không tìm thấy -> Báo lỗi ngay
    if (!session) {
      throw new UnauthorizedException(
        'Refresh Token không hợp lệ hoặc đã bị thu hồi.',
      );
    }

    const { user } = session;

    // 3. Kiểm tra xem Token đã hết hạn chưa
    if (session.expiresAt < new Date()) {
      // Dọn rác DB
      await this.refreshTokenRepo.remove(session);
      throw new UnauthorizedException(
        'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
      );
    }

    // 4. Kiểm tra xem tài khoản User có đang bị Admin khóa không?
    // Phải check bước này phòng khi user bị ban nhưng token vẫn còn hạn
    if (user.status !== UserStatus.ACTIVE) {
      await this.refreshTokenRepo.remove(session); // Hủy luôn phiên này
      throw new ForbiddenException('Tài khoản của bạn đã bị khóa.');
    }

    // ===============================================
    // 5. TOKEN ROTATION (BẢO MẬT CHUẨN PRODUCTION)
    // ===============================================

    // Bắt buộc XÓA session cũ đi (chỉ dùng 1 lần)
    await this.refreshTokenRepo.remove(session);

    // ===============================================
    // 6. CẤP CẶP TOKEN MỚI TINH
    // ===============================================

    // Cấp Access Token mới
    const jwtPayload = { sub: user.id, email: user.email, role: user.role };
    const newAccessToken = this.jwtService.sign(jwtPayload);

    // Cấp Refresh Token mới
    const newRefreshTokenString = crypto.randomBytes(64).toString('hex');
    const newHashedRefreshToken = crypto
      .createHash('sha256')
      .update(newRefreshTokenString)
      .digest('hex');

    const rtExpiresAt = new Date();
    rtExpiresAt.setDate(rtExpiresAt.getDate() + 7);

    // Lưu phiên bản mới vào DB
    const newSession = this.refreshTokenRepo.create({
      hashedToken: newHashedRefreshToken,
      expiresAt: rtExpiresAt,
      ipAddress: ipAddress,
      userAgent: userAgent,
      user: user,
    });
    await this.refreshTokenRepo.save(newSession);

    // 7. Trả về cho Frontend
    return {
      newAccessToken,
      newRefreshTokenString,
    };
  }

  async logout(refreshTokenString: string): Promise<void> {
    const hashedToken = crypto
      .createHash('sha256')
      .update(refreshTokenString)
      .digest('hex');

    // Có thể dùng lệnh delete hoặc update isRevoked = true
    const session = await this.refreshTokenRepo.findOne({
      where: { hashedToken },
    });

    if (session) {
      await this.refreshTokenRepo.remove(session);
    }
  }
}
