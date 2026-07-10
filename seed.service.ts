import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User, UserRole, UserStatus } from 'src/modules/user/user.entity';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Account } from 'src/modules/account/entities/account.entity';

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
  ) {}

  async seed() {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      this.logger.log('Bắt đầu quá trình seed dữ liệu...');

      const usersToSeed = [
        {
          fullName: 'Alice',
          email: 'alice@example.com',
          password: 'Password123!',
          role: UserRole.CUSTOMER,
          initialBalance: 5000000,
        },
        {
          fullName: 'Bob',
          email: 'bob@example.com',
          password: 'Password123!',
          role: UserRole.CUSTOMER,
          initialBalance: 2500000,
        },
        {
          fullName: 'Admin',
          email: 'admin@example.com',
          password: 'AdminPassword123!',
          role: UserRole.ADMIN,
          initialBalance: 10000000,
        },
      ];

      for (const userData of usersToSeed) {
        const userExists = await queryRunner.manager.findOneBy(User, {
          email: userData.email,
        });

        if (userExists) {
          this.logger.warn(
            `User với email ${userData.email} đã tồn tại. Bỏ qua.`,
          );
          continue;
        }

        const passwordHash = await bcrypt.hash(userData.password, 10);

        const newUser = this.userRepository.create({
          fullName: userData.fullName,
          email: userData.email,
          passwordHash,
          role: userData.role,
          isEmailVerified: true, // Seeded users are verified by default
          status: UserStatus.ACTIVE,
        });

        const savedUser = await queryRunner.manager.save(newUser);
        this.logger.log(`Đã tạo user: ${savedUser.email}`);

        const newAccount = this.accountRepository.create({
          accountNumber: Math.floor(
            1000000000 + Math.random() * 9000000000,
          ).toString(),
          balance: userData.initialBalance,
          currency: 'VND',
          user: savedUser,
        });

        await queryRunner.manager.save(newAccount);
        this.logger.log(
          `Đã tạo tài khoản cho user: ${savedUser.email} với số dư ${userData.initialBalance} VND`,
        );
      }

      await queryRunner.commitTransaction();
      this.logger.log('Seed dữ liệu thành công!');
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Lỗi trong quá trình seed dữ liệu:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
