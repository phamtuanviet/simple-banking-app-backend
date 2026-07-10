import { Module } from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { TransactionController } from './transaction.controller';
import { Transaction } from './entities/transaction.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationModule } from '../notification/notification.module';
import { MailModule } from '../mail/mail.module';
import { OtpVerification } from './entities/otp-verification.entity';
import { TransactionApproval } from './entities/transaction-approval.entity';
import { Account } from '../account/entities/account.entity';
import { TransactionCronService } from './transaction.cron';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Transaction,
      OtpVerification,
      TransactionApproval,
      Account,
    ]),
    NotificationModule,
    MailModule,
  ],
  controllers: [TransactionController],
  providers: [TransactionService, TransactionCronService],
})
export class TransactionModule {}
