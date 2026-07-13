import {
  IsNotEmpty,
  IsNumber,
  IsString,
  Min,
  MaxLength,
  IsOptional,
} from 'class-validator';

export class TellerTransferDto {
  @IsString()
  @IsNotEmpty({ message: 'Số tài khoản nguồn không được để trống.' })
  @MaxLength(20)
  fromAccountNumber: string;

  @IsString()
  @IsNotEmpty({ message: 'Số tài khoản đích không được để trống.' })
  @MaxLength(20)
  toAccountNumber: string;

  @IsNumber()
  @Min(10000, { message: 'Số tiền giao dịch tối thiểu là 10,000 VND' })
  amount: number;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;
}
