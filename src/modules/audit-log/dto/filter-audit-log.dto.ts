import {
  IsOptional,
  IsString,
  IsEmail,
  IsDate,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class FilterAuditLogDto {
  @IsOptional()
  @IsString()
  action?: string; // Ví dụ: LOGIN_SUCCESS, LOCK_ACCOUNT

  @IsOptional()
  @IsString()
  entity?: string; // Ví dụ: users, transactions

  @IsOptional()
  @IsEmail({}, { message: 'Định dạng email không hợp lệ' })
  email?: string; // Email của người thực hiện (actor)

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
