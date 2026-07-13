import {
  IsNotEmpty,
  IsNumber,
  IsString,
  Min,
  MaxLength,
  IsOptional,
} from 'class-validator';

export class CashTransactionDto {
  @IsString()
  @IsNotEmpty({ message: 'Số tài khoản không được để trống.' })
  @MaxLength(20, { message: 'Số tài khoản không được vượt quá 20 ký tự.' })
  accountNumber: string;

  @IsNumber()
  @Min(10000, { message: 'Số tiền giao dịch tối thiểu là 10,000 VND' })
  amount: number;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;
}
