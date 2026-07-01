import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  IsOptional,
  Max,
} from 'class-validator';

export class TransferDto {
  @IsString({ message: 'Số tài khoản đích phải là chuỗi' })
  @IsNotEmpty({ message: 'Vui lòng nhập số tài khoản đích' })
  toAccountNumber: string;

  @IsNumber({}, { message: 'Số tiền phải là số' })
  @Min(0.01, { message: 'Số tiền chuyển tối thiểu là 0.01' })
  @Max(10000000000, { message: 'Số tiền chuyển vượt quá hạn mức cho phép' }) // Tùy chỉnh hạn mức
  amount: number;

  @IsString()
  @IsOptional()
  description?: string;
}
