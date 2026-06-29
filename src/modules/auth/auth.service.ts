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
import { User } from '../user/user.entity';
import { RegisterDto } from './dto/register.dto';
import { MailService } from '../mail/mail.service';
import { ResendEmailDto } from './dto/resend-email.dto';
import { RefreshToken } from './entities/refresh-token.entity';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto';

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

    // ... (Toàn bộ logic kiểm tra khóa tài khoản, check password, failed attempts giữ nguyên như cũ) ...

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
    if (user.status !== 'active') {
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
    const hashedRefreshToken = await bcrypt.hash(refreshTokenString, 10);

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
      tokens: {
        accessToken: accessToken,
        refreshToken: refreshTokenString, // Trả về chuỗi GỐC chưa băm cho Frontend giữ
      },
    };
  }

  async register(registerDto: RegisterDto) {
    const { email, password, fullName } = registerDto;

    // 1. Kiểm tra xem email đã tồn tại trong DB chưa
    const existingUser = await this.userRepository.findOne({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictException('Email này đã được sử dụng!');
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
}
