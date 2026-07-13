import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, Repository } from 'typeorm';
import { User, UserRole, UserStatus } from '../user/user.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { Brackets } from 'typeorm/browser';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../transaction/entities/transaction.entity';
import { isUUID } from 'class-validator';
import { MailService } from '../mail/mail.service';
import { ApproveTransactionDto } from '../transaction/dto/approve-transaction.dto';
import {
  ApprovalAction,
  TransactionApproval,
} from '../transaction/entities/transaction-approval.entity';
import { TransactionService } from '../transaction/transaction.service';
import { ReversalDto } from '../transaction/dto/reversal.dto';
import {
  LedgerEntry,
  LedgerEntryType,
} from '../ledger-entry/entities/ledger-entry.entity';
import { Account } from '../account/entities/account.entity';
import {
  Notification,
  NotificationType,
} from '../notification/notification.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TellerTransferDto } from '../transaction/dto/teller-transfer.dto';
import { FilterUserHistoryDto } from '../user/dto/filter-user-history.dto';
import { UserHistory } from '../user/entities/user-history.entity';

export interface UserFilters {
  id?: string;
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
    private mailService: MailService,
    private dataSource: DataSource,
    private readonly transactionService: TransactionService,
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(UserHistory)
    private readonly userHistoryRepository: Repository<UserHistory>,
  ) {}

  private readonly LARGE_TRANSACTION_THRESHOLD = 500000000;

  // 1. API: Danh sách user (có phân trang)
  async getAllUsers(
    page: number = 1,
    limit: number = 10,
    filters?: UserFilters,
  ) {
    const skip = (page - 1) * limit;

    // 1. Tạo điều kiện lọc cơ bản (AND conditions)
    const baseCondition: any = {};

    if (filters?.id) {
      baseCondition.id = filters.id; // Dòng mới: Lọc chính xác theo ID
    }

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

  async tellerTransfer(dto: TellerTransferDto) {
    // 1. Chặn chuyển tiền cho chính mình
    if (dto.fromAccountNumber === dto.toAccountNumber) {
      throw new BadRequestException(
        'Tài khoản nguồn và tài khoản đích không được trùng nhau.',
      );
    }

    // 2. Kiểm tra sự tồn tại của 2 tài khoản (Chỉ Read, không cần Lock ở bước này)
    const fromAccount = await this.accountRepository.findOne({
      where: { accountNumber: dto.fromAccountNumber },
    });
    if (!fromAccount)
      throw new NotFoundException('Không tìm thấy tài khoản nguồn.');

    const toAccount = await this.accountRepository.findOne({
      where: { accountNumber: dto.toAccountNumber },
    });
    if (!toAccount)
      throw new NotFoundException('Không tìm thấy tài khoản đích.');

    // 3. Kiểm tra số dư sơ bộ
    if (Number(fromAccount.balance) < dto.amount) {
      throw new BadRequestException(
        'Số dư tài khoản nguồn không đủ để thực hiện giao dịch này.',
      );
    }

    // 4. Phân luồng rủi ro: Nếu >= 500 triệu -> Treo chờ duyệt
    if (dto.amount >= this.LARGE_TRANSACTION_THRESHOLD) {
      const tx = this.transactionRepository.create({
        amount: dto.amount,
        type: TransactionType.TRANSFER,
        status: TransactionStatus.PENDING_APPROVAL, // Trạng thái chờ sếp duyệt
        description:
          dto.description ||
          `Teller chuyển khoản từ ${fromAccount.accountNumber} tới ${toAccount.accountNumber}`,
        fromAccount: fromAccount,
        toAccount: toAccount,
      });
      const savedTx = await this.transactionRepository.save(tx);

      return {
        success: true,
        transactionId: savedTx.id,
        status: savedTx.status,
        message:
          'Giao dịch chuyển khoản vượt ngưỡng 500 triệu. Đã chuyển sang trạng thái chờ Quản lý phê duyệt.',
      };
    }

    // 5. Giao dịch < 500 triệu: Tạo hóa đơn và xử lý ngay
    const tx = this.transactionRepository.create({
      amount: dto.amount,
      type: TransactionType.TRANSFER,
      status: TransactionStatus.PROCESSING, // Sẵn sàng xử lý
      description:
        dto.description ||
        `Teller chuyển khoản từ ${fromAccount.accountNumber} tới ${toAccount.accountNumber}`,
      fromAccount: fromAccount,
      toAccount: toAccount,
    });
    const savedTx = await this.transactionRepository.save(tx);

    // 6. Quăng hóa đơn cho cỗ máy Core Banking xử lý dòng tiền
    return await this.transactionService.executeTransactionCore(savedTx.id);
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
        where: { status: TransactionStatus.COMPLETED },
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

  async approveTransaction(
    adminId: string,
    transactionId: string,
    dto: ApproveTransactionDto,
  ) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. CHỈ KHÓA BẢN GHI TRANSACTION (Bỏ relations ra khỏi đây)
      const tx = await queryRunner.manager.findOne(Transaction, {
        where: { id: transactionId },
        lock: { mode: 'pessimistic_write' },
        // Đã xóa relations ở đây để tránh lỗi LEFT JOIN của PostgreSQL
      });

      if (!tx) throw new NotFoundException('Giao dịch không tồn tại');
      if (tx.status !== TransactionStatus.PENDING_APPROVAL) {
        throw new BadRequestException('Giao dịch không ở trạng thái chờ duyệt');
      }

      // 1.1 Tải thông tin relations riêng biệt (Không cần khóa, chỉ để lấy data gửi mail)
      const txRelations = await queryRunner.manager.findOne(Transaction, {
        where: { id: transactionId },
        relations: {
          fromAccount: { user: true },
          toAccount: { user: true },
        },
      });

      // 2. Ghi log vào bảng Approval
      const approvalRecord = queryRunner.manager.create(TransactionApproval, {
        transaction: tx,
        checker: { id: adminId } as User,
        action: dto.action,
        remarks: dto.remarks,
      });
      await queryRunner.manager.save(TransactionApproval, approvalRecord);

      // 3. Xử lý State Machine
      if (dto.action === ApprovalAction.REJECTED) {
        tx.status = TransactionStatus.FAILED;
        await queryRunner.manager.save(Transaction, tx);
        await queryRunner.commitTransaction();

        // Gửi mail cho người gửi (Dùng data từ txRelations)
        if (txRelations?.fromAccount?.user?.email) {
          this.mailService
            .sendTransactionAlert(
              txRelations.fromAccount.user.email,
              `Giao dịch thất bại`,
              `Giao dịch ${tx.id} của bạn đã bị từ chối với lý do: ${dto.remarks}`,
            )
            .catch(console.error);
        }

        return { success: true, message: 'Đã từ chối giao dịch thành công' };
      }

      // 4. Nếu APPROVED -> Đổi status thành PROCESSING
      if (dto.action === ApprovalAction.APPROVED) {
        tx.status = TransactionStatus.PROCESSING;
        await queryRunner.manager.save(Transaction, tx);
        await queryRunner.commitTransaction();

        // Xử lý bước tiếp theo tùy thuộc vào loại giao dịch
        if (tx.type === TransactionType.WITHDRAWAL) {
          // Lưu ý: Rút tiền thì tiền đã trừ lúc PENDING_APPROVAL rồi, nên duyệt xong chỉ cần đổi status
          // Bạn có thể viết thêm hàm this.transactionService.executeWithdrawCore(tx.id) nếu cần
          return await this.transactionService.executeTransactionCore(tx.id);
        } else if (tx.type === TransactionType.TRANSFER) {
          return await this.transactionService.executeTransactionCore(tx.id);
        }

        return { success: true, message: 'Đã duyệt giao dịch thành công' };
      }
    } catch (error) {
      await queryRunner.rollbackTransaction();
      // Console log để dễ debug lỗi nếu còn
      console.error('Lỗi khi duyệt giao dịch:', error);
      throw new InternalServerErrorException(
        error.message || 'Lỗi hệ thống khi duyệt giao dịch',
      );
    } finally {
      await queryRunner.release();
    }
  }

  // ==========================================
  // API: ĐẢO CHIỀU GIAO DỊCH (REVERSAL)
  // ==========================================
  async reverseTransfer(dto: ReversalDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const originalTx = await queryRunner.manager.findOne(Transaction, {
        where: { id: dto.originalTransactionId },
        relations: { fromAccount: true, toAccount: true },
      });

      if (!originalTx)
        throw new NotFoundException('Không tìm thấy giao dịch gốc.');
      if (!originalTx.fromAccount || !originalTx.toAccount) {
        throw new BadRequestException(
          'Giao dịch gốc bị lỗi thiếu thông tin tài khoản.',
        );
      }
      if (originalTx.type !== TransactionType.TRANSFER) {
        throw new BadRequestException(
          'Chỉ hỗ trợ hoàn tiền cho giao dịch Chuyển khoản (TRANSFER).',
        );
      }
      if (originalTx.status !== TransactionStatus.COMPLETED) {
        throw new BadRequestException(
          'Chỉ có thể đảo chiều giao dịch đã hoàn thành (COMPLETED).',
        );
      }

      const existingReversal = await queryRunner.manager.findOne(Transaction, {
        where: {
          originalTransaction: { id: originalTx.id },
          type: TransactionType.REVERSAL,
          status: TransactionStatus.COMPLETED,
        },
      });
      if (existingReversal)
        throw new BadRequestException(
          'Giao dịch này đã được hoàn tiền trước đó.',
        );

      // 1. Khóa tài khoản chống Deadlock
      const accountIds = [
        originalTx.fromAccount.id,
        originalTx.toAccount.id,
      ].sort();
      await queryRunner.manager.findOne(Account, {
        where: { id: accountIds[0] },
        lock: { mode: 'pessimistic_write' },
      });
      await queryRunner.manager.findOne(Account, {
        where: { id: accountIds[1] },
        lock: { mode: 'pessimistic_write' },
      });

      // Lấy data kèm relation User để lát nữa lấy userId bắn Socket
      const originalSender = await queryRunner.manager.findOne(Account, {
        where: { id: originalTx.fromAccount.id },
        relations: { user: true },
      });
      const originalReceiver = await queryRunner.manager.findOne(Account, {
        where: { id: originalTx.toAccount.id },
        relations: { user: true },
      });

      if (!originalSender || !originalReceiver) {
        throw new NotFoundException(
          'Không tìm thấy dữ liệu tài khoản gửi/nhận để hoàn tiền.',
        );
      }

      // 2. KIỂM TRA SỐ DƯ KHI HOÀN TIỀN
      if (Number(originalReceiver.balance) < Number(originalTx.amount)) {
        const failedReversal = queryRunner.manager.create(Transaction, {
          amount: originalTx.amount,
          type: TransactionType.REVERSAL,
          status: TransactionStatus.FAILED,
          description: `Hoàn tiền thất bại do số dư không đủ. Giao dịch gốc: ${originalTx.id} - Lý do: ${dto.reason}`,
          fromAccount: originalReceiver,
          toAccount: originalSender,
          originalTransaction: originalTx,
        });
        await queryRunner.manager.save(Transaction, failedReversal);
        await queryRunner.commitTransaction();

        throw new BadRequestException(
          `Không thể hoàn tiền. Tài khoản ${originalReceiver.accountNumber} không đủ số dư.`,
        );
      }

      // 3. THỰC THI REVERSAL
      const reversalTx = queryRunner.manager.create(Transaction, {
        amount: originalTx.amount,
        type: TransactionType.REVERSAL,
        status: TransactionStatus.COMPLETED,
        description: `Hoàn tiền cho giao dịch ${originalTx.id} - Lý do: ${dto.reason}`,
        fromAccount: originalReceiver,
        toAccount: originalSender,
        originalTransaction: originalTx,
      });
      const savedReversalTx = await queryRunner.manager.save(
        Transaction,
        reversalTx,
      );

      originalReceiver.balance =
        Number(originalReceiver.balance) - Number(originalTx.amount);
      originalSender.balance =
        Number(originalSender.balance) + Number(originalTx.amount);
      await queryRunner.manager.save(Account, [
        originalReceiver,
        originalSender,
      ]);

      const ledgerDebit = queryRunner.manager.create(LedgerEntry, {
        transaction: savedReversalTx,
        account: originalReceiver,
        amount: originalTx.amount,
        type: LedgerEntryType.DEBIT,
        balanceAfter: originalReceiver.balance,
      });
      const ledgerCredit = queryRunner.manager.create(LedgerEntry, {
        transaction: savedReversalTx,
        account: originalSender,
        amount: originalTx.amount,
        type: LedgerEntryType.CREDIT,
        balanceAfter: originalSender.balance,
      });
      await queryRunner.manager.save(LedgerEntry, [ledgerDebit, ledgerCredit]);

      // 4. BỔ SUNG NOTIFICATION (Chuẩn xác như executeTransactionCore)
      const notifications: any[] = [];
      // Người nhận cũ bị trừ tiền (TRANSFER_OUT)
      notifications.push(
        this.transactionService.createNotification(
          originalReceiver,
          NotificationType.TRANSFER_OUT,
          originalTx.amount,
          originalReceiver.balance,
          savedReversalTx,
        ),
      );
      // Người gửi cũ được cộng lại tiền (TRANSFER_IN)
      notifications.push(
        this.transactionService.createNotification(
          originalSender,
          NotificationType.TRANSFER_IN,
          originalTx.amount,
          originalSender.balance,
          savedReversalTx,
        ),
      );

      const savedNotifications = await queryRunner.manager.save(
        Notification,
        notifications,
      );

      // 5. CẬP NHẬT TRẠNG THÁI GIAO DỊCH GỐC VÀ COMMIT
      originalTx.status = TransactionStatus.REVERSED;
      await queryRunner.manager.save(Transaction, originalTx);

      await queryRunner.commitTransaction();

      // 6. BẮN SOCKET TỚI ĐÚNG USER
      this.eventEmitter.emit('notification.created', {
        notificationId: savedNotifications[0].id,
        userId: originalReceiver.user.id,
      });
      this.eventEmitter.emit('notification.created', {
        notificationId: savedNotifications[1].id,
        userId: originalSender.user.id,
      });

      return {
        success: true,
        transactionId: savedReversalTx.id,
        status: savedReversalTx.status,
        message: `Đã hoàn thành đảo chiều giao dịch. Trả lại ${Number(originalTx.amount).toLocaleString('vi-VN')} VND.`,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findAllForAdmin(dto: FilterUserHistoryDto) {
    try {
      // Thêm bộ bóc tách dữ liệu ngày tháng từ dto
      const {
        userId,
        email,
        changedById,
        fromDate,
        toDate,
        page = 1,
        limit = 10,
      } = dto;
      const skip = (page - 1) * limit;

      const queryBuilder = this.userHistoryRepository
        .createQueryBuilder('history')
        .leftJoinAndSelect('history.user', 'user')
        .orderBy('history.createdAt', 'DESC');

      // 1. Lọc theo ID của người dùng bị thay đổi
      if (userId) {
        queryBuilder.andWhere('user.id = :userId', { userId });
      }

      // 2. Lọc theo Email của người dùng bị thay đổi
      if (email) {
        queryBuilder.andWhere('user.email = :email', { email });
      }

      // 3. Lọc theo ID của người thực hiện hành động
      if (changedById) {
        queryBuilder.andWhere('history.changedById = :changedById', {
          changedById,
        });
      }

      // 4. Lọc theo khoảng thời gian (Dòng mới thêm)
      if (fromDate) {
        queryBuilder.andWhere('history.createdAt >= :fromDate', { fromDate });
      }
      if (toDate) {
        queryBuilder.andWhere('history.createdAt <= :toDate', { toDate });
      }

      const [data, total] = await queryBuilder
        .skip(skip)
        .take(limit)
        .getManyAndCount(); // Đảm bảo sử dụng getManyAndCount để tránh lỗi map dữ liệu phân trang

      const formattedItems = data.map((item) => ({
        id: item.id,
        changedById: item.changedById,
        previousData: item.previousData,
        reason: item.reason,
        createdAt: item.createdAt,
        user: item.user
          ? {
              id: item.user.id,
              email: item.user.email,
              fullName: item.user.fullName,
              status: item.user.status,
            }
          : null,
      }));

      return {
        total,
        page,
        limit,
        items: formattedItems,
      };
    } catch (error) {
      console.error('Lỗi truy vấn lịch sử người dùng:', error);
      throw new InternalServerErrorException(
        'Lỗi hệ thống khi tải lịch sử người dùng.',
      );
    }
  }
}
