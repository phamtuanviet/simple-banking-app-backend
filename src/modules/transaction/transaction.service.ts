import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  DataSource,
  Between,
  MoreThanOrEqual,
  LessThanOrEqual,
} from 'typeorm';
import { Account } from '../account/entities/account.entity';
import { TransferDto } from './dto/transfer.dto';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from './entities/transaction.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Notification,
  NotificationStatus,
  NotificationType,
} from '../notification/notification.entity';

export interface TransactionFilters {
  status?: string;
  startDate?: string;
  endDate?: string;
  flow?: 'in' | 'out';
}

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    private dataSource: DataSource,
    private eventEmitter: EventEmitter2,
  ) {}

  async transferFunds(
    userId: string,
    transferDto: TransferDto,
    idempotencyKey: string,
  ) {
    const { toAccountNumber, amount, description } = transferDto;

    const existingTransaction = await this.transactionRepository.findOne({
      where: { idempotencyKey },
    });

    if (existingTransaction) {
      return {
        success: true,
        message: 'Giao dịch đã được xử lý thành công trước đó.',
        transactionId: existingTransaction.id,
      };
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Lấy và KHÓA tài khoản người gửi (Pessimistic Write Lock)
      const senderAccount = await queryRunner.manager
        .createQueryBuilder(Account, 'account')
        .innerJoinAndSelect('account.user', 'user') // Ép dùng INNER JOIN
        .where('user.id = :userId', { userId })
        .setLock('pessimistic_write') // Khóa dòng an toàn
        .getOne();

      if (!senderAccount) {
        throw new BadRequestException('Không tìm thấy tài khoản nguồn.');
      }

      // 2. Chống tự chuyển khoản cho chính mình
      if (senderAccount.accountNumber === toAccountNumber) {
        throw new BadRequestException(
          'Không thể tự chuyển khoản cho chính mình.',
        );
      }

      // 3. Lấy và KHÓA tài khoản người nhận bằng QueryBuilder
      const receiverAccount = await queryRunner.manager
        .createQueryBuilder(Account, 'account')
        .innerJoinAndSelect('account.user', 'user') // Ép dùng INNER JOIN
        .where('account.accountNumber = :accountNumber', {
          accountNumber: toAccountNumber,
        })
        .andWhere('account.isActive = :isActive', { isActive: true })
        .setLock('pessimistic_write') // Khóa dòng an toàn
        .getOne();

      if (!receiverAccount) {
        throw new BadRequestException(
          'Tài khoản đích không tồn tại hoặc đã bị khóa.',
        );
      }

      // 4. Kiểm tra số dư (Ép kiểu float vì Postgres numeric trả về string)
      const currentBalance = parseFloat(senderAccount.balance.toString());
      if (currentBalance < amount) {
        throw new BadRequestException(
          'Số dư khả dụng không đủ để thực hiện giao dịch.',
        );
      }

      // 5. Cập nhật số dư hai bên
      senderAccount.balance = currentBalance - amount;
      receiverAccount.balance =
        parseFloat(receiverAccount.balance.toString()) + amount;

      await queryRunner.manager.save(Account, senderAccount);
      await queryRunner.manager.save(Account, receiverAccount);

      // 6. Ghi lại lịch sử giao dịch
      const transaction = new Transaction();
      transaction.amount = amount;
      transaction.type = TransactionType.TRANSFER;
      transaction.status = TransactionStatus.SUCCESS;
      transaction.description =
        description || `Chuyển tiền tới ${toAccountNumber}`;
      transaction.fromAccount = senderAccount;
      transaction.toAccount = receiverAccount;
      transaction.idempotencyKey = idempotencyKey;

      const savedTransaction = await queryRunner.manager.save(
        Transaction,
        transaction,
      );

      // 7. Commit toàn bộ thay đổi
      const senderNotification = new Notification();
      senderNotification.user = senderAccount.user;
      senderNotification.type = NotificationType.TRANSFER_OUT;
      senderNotification.title = 'Chuyển tiền thành công';
      senderNotification.message = `Bạn đã chuyển ${amount} VND tới STK ${toAccountNumber}.`;
      senderNotification.amount = amount;
      senderNotification.balanceAfterTransaction = senderAccount.balance;
      senderNotification.transaction = savedTransaction;
      senderNotification.status = NotificationStatus.PENDING;

      // 7.2 Thông báo cho Người Nhận (Tiền vào)
      const receiverNotification = new Notification();
      receiverNotification.user = receiverAccount.user;
      receiverNotification.type = NotificationType.TRANSFER_IN;
      receiverNotification.title = 'Nhận tiền thành công';
      receiverNotification.message = `Bạn vừa nhận được ${amount} VND từ STK ${senderAccount.accountNumber}.`;
      receiverNotification.amount = amount;
      receiverNotification.balanceAfterTransaction = receiverAccount.balance;
      receiverNotification.transaction = savedTransaction;
      receiverNotification.status = NotificationStatus.PENDING;

      // Lưu cùng lúc cả 2 thông báo vào DB
      const savedNotifications = await queryRunner.manager.save(Notification, [
        senderNotification,
        receiverNotification,
      ]);

      // 8. Commit toàn bộ thay đổi (Tiền và Thông báo đều được ghi lại an toàn)
      await queryRunner.commitTransaction();

      // ==============================================================
      // 9. CẬP NHẬT: BẮN SỰ KIỆN ĐỂ CHẠY NGẦM SOCKET (KẾT THÚC API)
      // ==============================================================

      // Bắn sự kiện cho người gửi
      this.eventEmitter.emit('notification.created', {
        notificationId: savedNotifications[0].id,
        userId: senderAccount.user.id,
      });

      // Bắn sự kiện cho người nhận
      this.eventEmitter.emit('notification.created', {
        notificationId: savedNotifications[1].id,
        userId: receiverAccount.user.id,
      });

      return {
        success: true,
        message: 'Chuyển khoản thành công',
        transactionId: savedTransaction.id,
        newBalance: senderAccount.balance,
      };
    } catch (error) {
      // BẤT KỲ LỖI GÌ CŨNG PHẢI ROLLBACK (Không mất tiền, không sinh thông báo rác)
      await queryRunner.rollbackTransaction();

      if (error instanceof BadRequestException) {
        throw error;
      }

      if (error.code === '23505' && error.detail.includes('idempotency_key')) {
        throw new BadRequestException(
          'Giao dịch đang được xử lý. Vui lòng không thao tác quá nhanh.',
        );
      }

      console.error('Lỗi giao dịch:', error);
      throw new InternalServerErrorException(
        'Giao dịch thất bại do lỗi hệ thống. Đã hoàn tác.',
      );
    } finally {
      await queryRunner.release();
    }
  }

  async getTransactionHistory(
    userId: string,
    page: number = 1,
    limit: number = 10,
    filters?: TransactionFilters,
  ) {
    const account = await this.dataSource.manager.findOne(Account, {
      where: { user: { id: userId } },
    });

    if (!account) throw new BadRequestException('Không tìm thấy tài khoản');

    const skip = (page - 1) * limit;

    // 1. Tạo Base Filter (chứa điều kiện về status và thời gian)
    const baseFilter: any = {};

    if (filters?.status) {
      baseFilter.status = filters.status;
    }

    if (filters?.startDate || filters?.endDate) {
      if (filters.startDate && filters.endDate) {
        baseFilter.createdAt = Between(
          new Date(`${filters.startDate}T00:00:00.000Z`),
          new Date(`${filters.endDate}T23:59:59.999Z`),
        );
      } else if (filters.startDate) {
        baseFilter.createdAt = MoreThanOrEqual(
          new Date(`${filters.startDate}T00:00:00.000Z`),
        );
      } else if (filters.endDate) {
        baseFilter.createdAt = LessThanOrEqual(
          new Date(`${filters.endDate}T23:59:59.999Z`),
        );
      }
    }

    // 2. Xử lý điều kiện Flow (Tiền vào / Tiền ra)
    let whereCondition: any;

    if (filters?.flow === 'in') {
      // Tiền vào: Tài khoản của user là người nhận (toAccount)
      whereCondition = { toAccount: { id: account.id }, ...baseFilter };
    } else if (filters?.flow === 'out') {
      // Tiền ra: Tài khoản của user là người gửi (fromAccount)
      whereCondition = { fromAccount: { id: account.id }, ...baseFilter };
    } else {
      // Không lọc flow: Lấy cả tiền vào HOẶC tiền ra (Mảng [] trong TypeORM tương đương OR)
      whereCondition = [
        { fromAccount: { id: account.id }, ...baseFilter },
        { toAccount: { id: account.id }, ...baseFilter },
      ];
    }

    // 3. Thực thi query
    const [transactions, total] = await this.transactionRepository.findAndCount(
      {
        where: whereCondition,
        relations: {
          fromAccount: true,
          toAccount: true,
        },
        order: { createdAt: 'DESC' }, // Giao dịch mới nhất lên đầu
        skip,
        take: limit,
      },
    );

    const formattedItems = transactions.map((tx) => ({
      id: tx.id,
      fromAccountId: tx.fromAccount ? tx.fromAccount.id : null,
      toAccountId: tx.toAccount ? tx.toAccount.id : null,
      amount: parseFloat(tx.amount.toString()), // Ép kiểu về number
      type: tx.type,
      status: tx.status,
      description: tx.description,
      createdAt: tx.createdAt.toISOString(), // Chuyển Date object thành string chuẩn ISO
    }));

    return {
      items: formattedItems,
      total: total,
      page: page,
      limit: limit,
      lastPage: Math.ceil(total / limit),
    };
  }
}
