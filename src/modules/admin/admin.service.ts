import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole, UserStatus } from '../user/user.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private refreshTokenRepository: Repository<RefreshToken>,
  ) {}

  // 1. API: Danh sách user (có phân trang)
  async getAllUsers(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [users, total] = await this.userRepository.findAndCount({
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        status: true,
        isEmailVerified: true,
        createdAt: true,
      }, // Tuyệt đối KHÔNG select passwordHash và các token nhạy cảm
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return {
      data: users,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  // 2. API: Khóa/Mở tài khoản
  async updateUserStatus(userId: string, newStatus: UserStatus) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException(
        'Không tìm thấy người dùng này trong hệ thống.',
      );
    }

    if (user.role === UserRole.ADMIN) {
      throw new BadRequestException('Không thể khóa tài khoản của Admin khác.');
    }

    user.status = newStatus;

    // Nếu khóa tài khoản, có thể reset luôn các token để ép họ đăng xuất (tùy chọn)
    if (newStatus === UserStatus.LOCKED || newStatus === UserStatus.BANNED) {
      await this.refreshTokenRepository.delete({ user: { id: userId } });
    }

    await this.userRepository.save(user);

    return {
      message: `Đã cập nhật trạng thái người dùng thành: ${newStatus}`,
      user: {
        id: user.id,
        email: user.email,
        status: user.status,
      },
    };
  }
}
