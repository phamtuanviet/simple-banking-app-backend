import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Account } from '../account/entities/account.entity';
import { TransferDto } from './dto/transfer.dto';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from './entities/transaction.entity';

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    private dataSource: DataSource,
  ) {}

  async transferFunds(userId: string, transferDto: TransferDto) {
    const { toAccountNumber, amount, description } = transferDto;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Lấy và KHÓA tài khoản người gửi (Pessimistic Write Lock)
      const senderAccount = await queryRunner.manager.findOne(Account, {
        where: { user: { id: userId } },
        lock: { mode: 'pessimistic_write' }, // Chống Race Condition
      });

      if (!senderAccount) {
        throw new BadRequestException('Không tìm thấy tài khoản nguồn.');
      }

      // 2. Chống tự chuyển khoản cho chính mình
      if (senderAccount.accountNumber === toAccountNumber) {
        throw new BadRequestException(
          'Không thể tự chuyển khoản cho chính mình.',
        );
      }

      // 3. Lấy và KHÓA tài khoản người nhận
      const receiverAccount = await queryRunner.manager.findOne(Account, {
        where: { accountNumber: toAccountNumber, isActive: true },
        lock: { mode: 'pessimistic_write' },
      });

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

      await queryRunner.manager.save(Transaction, transaction);

      // 7. Commit toàn bộ thay đổi
      await queryRunner.commitTransaction();

      return {
        success: true,
        message: 'Chuyển khoản thành công',
        transactionId: transaction.id,
        newBalance: senderAccount.balance,
      };
    } catch (error) {
      // BẤT KỲ LỖI GÌ CŨNG PHẢI ROLLBACK
      await queryRunner.rollbackTransaction();

      if (error instanceof BadRequestException) {
        throw error; // Ném lại lỗi logic nghiệp vụ để user biết
      }

      console.error('Lỗi giao dịch:', error);
      throw new InternalServerErrorException(
        'Giao dịch thất bại do lỗi hệ thống. Đã hoàn tác.',
      );
    } finally {
      // Giải phóng connection
      await queryRunner.release();
    }
  }

  async getTransactionHistory(
    userId: string,
    page: number = 1,
    limit: number = 10,
  ) {
    // Tìm ID tài khoản của user trước
    const account = await this.dataSource.manager.findOne(Account, {
      where: { user: { id: userId } },
    });

    if (!account) throw new BadRequestException('Không tìm thấy tài khoản');

    const skip = (page - 1) * limit;

    // Lấy giao dịch mà tài khoản này là người gửi HOẶC người nhận
    const [transactions, total] = await this.transactionRepository.findAndCount(
      {
        where: [
          { fromAccount: { id: account.id } },
          { toAccount: { id: account.id } },
        ],
        relations: {
          fromAccount: true,
          toAccount: true,
        },
        order: { createdAt: 'DESC' },
        skip,
        take: limit,
      },
    );

    return {
      data: transactions,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }
}
