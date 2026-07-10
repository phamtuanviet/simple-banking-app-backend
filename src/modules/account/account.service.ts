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

  async getRecipientInfo(accountNumber: string) {
    const account = await this.accountRepository.findOne({
      where: {
        accountNumber: accountNumber,
        isActive: true, // Tùy chọn: Đảm bảo tài khoản này đang không bị khóa
      },
      relations: { user: true }, // BẮT BUỘC: để TypeORM join sang bảng users lấy fullName
    });

    // Nếu gõ sai số tài khoản hoặc không tồn tại, quăng lỗi 404
    if (!account) {
      throw new NotFoundException('Không tìm thấy tài khoản người nhận hợp lệ');
    }

    // Quan trọng: CHỈ trả về số tài khoản và tên, không trả về toàn bộ thực thể account (ẩn balance, id, v.v.)
    return {
      accountNumber: account.accountNumber,
      fullName: account.user.fullName,
    };
  }
}
