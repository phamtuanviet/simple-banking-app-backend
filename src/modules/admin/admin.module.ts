import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../user/user.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { Transaction } from '../transaction/entities/transaction.entity';
import { MailModule } from '../mail/mail.module';
import { TransactionModule } from '../transaction/transaction.module';
import { Account } from '../account/entities/account.entity';
import { UserHistory } from '../user/entities/user-history.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      RefreshToken,
      Transaction,
      Account,
      UserHistory,
    ]),
    TransactionModule,
    MailModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, MailModule],
})
export class AdminModule {}
