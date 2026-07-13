import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LedgerEntry } from './entities/ledger-entry.entity';
import { FilterLedgerDto } from './dto/filter-ledger.dto';

@Injectable()
export class LedgerService {
  constructor(
    @InjectRepository(LedgerEntry)
    private readonly ledgerRepository: Repository<LedgerEntry>,
  ) {}

  async findAllForAdmin(dto: FilterLedgerDto) {
    try {
      const {
        accountNumber,
        type,
        transactionId,
        fromDate,
        toDate,
        page = 1,
        limit = 10,
      } = dto;
      const skip = (page - 1) * limit;

      // Khởi tạo Query Builder với bí danh 'ledger'
      const queryBuilder = this.ledgerRepository
        .createQueryBuilder('ledger')
        .leftJoinAndSelect('ledger.account', 'account')
        .leftJoinAndSelect('ledger.transaction', 'transaction')
        .orderBy('ledger.createdAt', 'DESC'); // Ưu tiên hiển thị các bút toán mới nhất lên đầu

      // 1. Lọc theo số tài khoản khách hàng (Tìm chính xác hoặc tìm kiếm gần đúng tùy nghiệp vụ)
      if (accountNumber) {
        queryBuilder.andWhere('account.accountNumber = :accountNumber', {
          accountNumber,
        });
      }

      // 2. Lọc theo loại bút toán (debit / credit)
      if (type) {
        queryBuilder.andWhere('ledger.type = :type', { type });
      }

      // 3. Lọc theo mã giao dịch cụ thể
      if (transactionId) {
        queryBuilder.andWhere('transaction.id = :transactionId', {
          transactionId,
        });
      }

      // 4. Lọc theo khoảng thời gian tạo bút toán (Đối soát toán ngày/tháng)
      if (fromDate) {
        queryBuilder.andWhere('ledger.createdAt >= :fromDate', { fromDate });
      }
      if (toDate) {
        // Mẹo nghiệp vụ: Nếu lọc đến ngày X, cần tính đến hết 23:59:59 của ngày đó
        queryBuilder.andWhere('ledger.createdAt <= :toDate', { toDate });
      }

      // Thực thi phân trang và lấy tổng số bản ghi phục vụ vẽ UI table ở Frontend
      const [data, total] = await queryBuilder
        .skip(skip)
        .take(limit)
        .getManyAndCount();

      // Ép kiểu dữ liệu chuỗi dạng Numeric từ Postgres về Number cho an toàn hiển thị
      const formattedData = data.map((entry) => ({
        ...entry,
        amount: Number(entry.amount),
        balanceAfter: Number(entry.balanceAfter),
      }));

      return {
        total: total,
        page: page,
        limit: limit,
        items: formattedData,
      };
    } catch (error) {
      console.error('Lỗi tra cứu Sổ cái của Admin:', error);
      throw new InternalServerErrorException(
        'Lỗi hệ thống khi trích xuất dữ liệu Sổ cái.',
      );
    }
  }
}
