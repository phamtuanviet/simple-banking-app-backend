import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { User, UserRole, UserStatus } from '../user/user.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { Brackets } from 'typeorm/browser';
import {
  Transaction,
  TransactionStatus,
} from '../transaction/entities/transaction.entity';
import { isUUID } from 'class-validator';

export interface UserFilters {
  search?: string;
  status?: UserStatus;
  role?: UserRole;
  isEmailVerified?: boolean;
}

export interface AdminTransactionFilters {
  search?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private refreshTokenRepository: Repository<RefreshToken>,

    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
  ) {}

  // 1. API: Danh sách user (có phân trang)
  async getAllUsers(
    page: number = 1,
    limit: number = 10,
    filters?: UserFilters,
  ) {
    const skip = (page - 1) * limit;

    // 1. Tạo điều kiện lọc cơ bản (AND conditions)
    const baseCondition: any = {};

    if (filters?.status) {
      baseCondition.status = filters.status;
    }

    if (filters?.role) {
      baseCondition.role = filters.role;
    }

    if (filters?.isEmailVerified !== undefined) {
      baseCondition.isEmailVerified = filters.isEmailVerified;
    }

    // 2. Xử lý tìm kiếm chuỗi (OR conditions: tìm theo Tên HOẶC Email)
    let whereQuery: any = baseCondition;

    if (filters?.search) {
      whereQuery = [
        { ...baseCondition, fullName: ILike(`%${filters.search}%`) },
        { ...baseCondition, email: ILike(`%${filters.search}%`) },
      ];
    }

    // 3. Thực thi truy vấn
    const [users, total] = await this.userRepository.findAndCount({
      where: whereQuery,
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

    // 4. Trả về đúng format PaginatedData
    return {
      items: users,
      total: total,
      page: page,
      limit: limit,
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

    // Nếu khóa tài khoản, có thể reset luôn các token để ép họ đăng xuất
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

  async getAllTransactions(
    page: number = 1,
    limit: number = 10,
    filters?: AdminTransactionFilters,
  ) {
    const skip = (page - 1) * limit;

    // Khởi tạo QueryBuilder, 'tx' là bí danh (alias) của bảng transactions
    const queryBuilder = this.transactionRepository
      .createQueryBuilder('tx')
      .leftJoinAndSelect('tx.fromAccount', 'fromAccount')
      .leftJoinAndSelect('fromAccount.user', 'fromUser')
      .leftJoinAndSelect('tx.toAccount', 'toAccount')
      .leftJoinAndSelect('toAccount.user', 'toUser');

    // 1. Lọc theo thời gian (startDate, endDate)
    if (filters?.startDate && filters?.endDate) {
      queryBuilder.andWhere('tx.created_at BETWEEN :start AND :end', {
        start: new Date(`${filters.startDate}T00:00:00.000Z`),
        end: new Date(`${filters.endDate}T23:59:59.999Z`),
      });
    } else if (filters?.startDate) {
      queryBuilder.andWhere('tx.created_at >= :start', {
        start: new Date(`${filters.startDate}T00:00:00.000Z`),
      });
    } else if (filters?.endDate) {
      queryBuilder.andWhere('tx.created_at <= :end', {
        end: new Date(`${filters.endDate}T23:59:59.999Z`),
      });
    }

    // 2. Lọc theo trạng thái
    if (filters?.status) {
      queryBuilder.andWhere('tx.status = :status', { status: filters.status });
    }

    // 3. Tìm kiếm toàn văn (Search)
    if (filters?.search) {
      queryBuilder.andWhere(
        new Brackets((qb) => {
          if (isUUID(filters.search)) {
            qb.where('tx.id = :id', { id: filters.search });
          }
          qb.orWhere('fromAccount.accountNumber ILIKE :search', {
            search: `%${filters.search}%`,
          })
            .orWhere('toAccount.accountNumber ILIKE :search', {
              search: `%${filters.search}%`,
            })
            .orWhere('fromUser.fullName ILIKE :search', {
              search: `%${filters.search}%`,
            })
            .orWhere('toUser.fullName ILIKE :search', {
              search: `%${filters.search}%`,
            });
        }),
      );
    }

    // Thực thi truy vấn
    queryBuilder.orderBy('tx.created_at', 'DESC');
    queryBuilder.skip(skip).take(limit);

    const [transactions, total] = await queryBuilder.getManyAndCount();

    // 4. Map dữ liệu để trả về đúng Interface AdminTransaction của Frontend
    // Lưu ý: Frontend dùng key 'full_name' trong khi Backend Entity là 'fullName'
    const formattedItems = transactions.map((tx) => ({
      id: tx.id,
      amount: parseFloat(tx.amount.toString()),
      type: tx.type,
      status: tx.status,
      description: tx.description,
      createdAt: tx.createdAt.toISOString(),
      fromAccount: tx.fromAccount
        ? {
            id: tx.fromAccount.id,
            accountNumber: tx.fromAccount.accountNumber,
            user: tx.fromAccount.user
              ? {
                  id: tx.fromAccount.user.id,
                  full_name: tx.fromAccount.user.fullName, // Map đúng key
                  email: tx.fromAccount.user.email,
                }
              : undefined,
          }
        : undefined,
      toAccount: tx.toAccount
        ? {
            id: tx.toAccount.id,
            accountNumber: tx.toAccount.accountNumber,
            user: tx.toAccount.user
              ? {
                  id: tx.toAccount.user.id,
                  full_name: tx.toAccount.user.fullName, // Map đúng key
                  email: tx.toAccount.user.email,
                }
              : undefined,
          }
        : undefined,
    }));

    return {
      items: formattedItems,
      total: total,
      page: page,
      limit: limit,
    };
  }

  async getDashboardStats() {
    // Dùng Promise.all để chạy 5 câu query đếm song song, tối ưu tốc độ
    const [
      totalUsers,
      activeUsers,
      lockedUsers,
      totalTransactions,
      successfulTransactions,
    ] = await Promise.all([
      this.userRepository.count(),
      this.userRepository.count({ where: { status: UserStatus.ACTIVE } }),
      this.userRepository.count({ where: { status: UserStatus.LOCKED } }),
      this.transactionRepository.count(),
      this.transactionRepository.count({
        where: { status: TransactionStatus.SUCCESS },
      }),
    ]);

    // Trả về đúng object khớp với interface SystemStats của Frontend
    return {
      totalUsers,
      activeUsers,
      lockedUsers,
      totalTransactions,
      successfulTransactions,
    };
  }
}
