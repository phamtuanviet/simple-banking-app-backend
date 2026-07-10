import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Transaction, TransactionStatus } from './entities/transaction.entity';

@Injectable()
export class TransactionCronService {
  private readonly logger = new Logger(TransactionCronService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
  ) {}

  // Cứ mỗi 5 phút hàm này sẽ tự động chạy 1 lần
  @Cron(CronExpression.EVERY_5_MINUTES)
  async cleanupExpiredTransactions() {
    this.logger.log('Bắt đầu quét các giao dịch PENDING_OTP hết hạn...');

    // Tính toán mốc thời gian: Lấy thời điểm hiện tại lùi lại 15 phút
    const expirationTime = new Date();
    expirationTime.setMinutes(expirationTime.getMinutes() - 15);

    // Tìm tất cả giao dịch đang PENDING_OTP mà được tạo từ TRƯỚC mốc expirationTime
    const expiredTransactions = await this.transactionRepo.find({
      where: {
        status: TransactionStatus.PENDING_OTP,
        createdAt: LessThan(expirationTime),
      },
    });

    if (expiredTransactions.length === 0) {
      return;
    }

    // Cập nhật hàng loạt thành FAILED
    const expiredIds = expiredTransactions.map((tx) => tx.id);
    await this.transactionRepo.update(expiredIds, {
      status: TransactionStatus.FAILED,
    });

    this.logger.log(`Đã hủy ${expiredIds.length} giao dịch quá hạn nhập OTP.`);
  }
}
