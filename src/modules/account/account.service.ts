import { Injectable, NotFoundException } from '@nestjs/common';

import { Account } from './entities/account.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class AccountService {
  constructor(
    @InjectRepository(Account)
    private accountRepository: Repository<Account>,
  ) {}

  async getMyAccount(userId: string) {
    const account = await this.accountRepository.findOne({
      where: { user: { id: userId } },
    });

    if (!account) {
      throw new NotFoundException(
        'Không tìm thấy tài khoản ngân hàng của bạn.',
      );
    }

    // Convert balance từ string (do numeric type) sang number để client dễ dùng
    return {
      ...account,
      balance: parseFloat(account.balance.toString()),
    };
  }
}
