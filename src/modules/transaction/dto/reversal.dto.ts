import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class ReversalDto {
  @IsUUID()
  @IsNotEmpty({ message: 'Bắt buộc truyền ID của giao dịch gốc' })
  originalTransactionId: string;

  @IsString()
  @IsNotEmpty({ message: 'Bắt buộc nhập lý do hoàn tiền' })
  @MaxLength(255)
  reason: string;
}
