import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserStatus } from '../../user/user.entity';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly cls: ClsService,
  ) {
    // Cấu hình cách lấy và giải mã Token
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET is not defined');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), // Lấy từ header Authorization: Bearer <token>
      ignoreExpiration: false, // Báo lỗi ngay nếu token hết hạn
      secretOrKey: secret, // Key giải mã phải giống hệt key lúc sign()
    });
  }

  // Hàm này CHỈ CHẠY khi Token hợp lệ (chữ ký đúng và chưa hết hạn)
  // Payload chính là cái object { sub, email, role } mà ta đã tạo ở hàm login
  async validate(payload: any) {
    // 1. (Tùy chọn) Truy vấn DB để lấy thông tin mới nhất của User
    // Điều này đảm bảo an toàn tối đa: Nếu user vừa bị Admin BAN, họ sẽ bị chặn ngay lập tức
    // dù Access Token của họ vẫn còn hạn.
    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('Tài khoản không tồn tại.');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Tài khoản của bạn đã bị khóa.');
    }

    // 2. BẤT CỨ THỨ GÌ bạn return ở đây, NestJS sẽ tự động gán nó vào `request.user`
    // Để tối ưu bộ nhớ và bảo mật, ta bỏ lại passwordHash trước khi return
    const { passwordHash, ...userWithoutPassword } = user;
    this.cls.set('userId', user.id);

    return userWithoutPassword;
  }
}
