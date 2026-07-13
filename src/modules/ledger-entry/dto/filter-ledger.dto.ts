import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  IsDate,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LedgerEntryType } from 'src/modules/ledger-entry/entities/ledger-entry.entity';

export class FilterLedgerDto {
  @IsOptional()
  @IsString()
  accountNumber?: string;

  @IsOptional()
  @IsEnum(LedgerEntryType, {
    message: 'Loại bút toán chỉ có thể là debit hoặc credit',
  })
  type?: LedgerEntryType;

  @IsOptional()
  @IsUUID('4', { message: 'Mã giao dịch phải là định dạng UUID chuẩn' })
  transactionId?: string;

  // Lọc theo khoảng thời gian để đối soát cuối ngày
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'Định dạng ngày bắt đầu không hợp lệ' })
  fromDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'Định dạng ngày kết thúc không hợp lệ' })
  toDate?: Date;

  // Các trường phục vụ phân trang (Pagination)
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;
}
