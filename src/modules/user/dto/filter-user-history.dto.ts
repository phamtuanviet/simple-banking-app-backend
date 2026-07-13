import {
  IsOptional,
  IsUUID,
  IsEmail,
  IsInt,
  Min,
  IsDate,
} from 'class-validator';
import { Type } from 'class-transformer';

export class FilterUserHistoryDto {
  @IsOptional()
  @IsUUID('4', { message: 'ID người dùng phải là định dạng UUID' })
  userId?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Định dạng email không hợp lệ' })
  email?: string;

  @IsOptional()
  @IsUUID('4')
  changedById?: string;

  // Dòng mới: Lọc theo khoảng thời gian tạo lịch sử
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'Định dạng ngày bắt đầu không hợp lệ' })
  fromDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'Định dạng ngày kết thúc không hợp lệ' })
  toDate?: Date;

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
