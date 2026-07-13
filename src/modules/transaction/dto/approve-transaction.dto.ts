import { IsEnum, IsNotEmpty, IsString, ValidateIf } from 'class-validator';
import { ApprovalAction } from '../entities/transaction-approval.entity';

export class ApproveTransactionDto {
  @IsEnum(ApprovalAction)
  @IsNotEmpty()
  action: ApprovalAction;

  // Nếu action là REJECTED thì remarks không được để trống
  @ValidateIf((o) => o.action === ApprovalAction.REJECTED)
  @IsNotEmpty({ message: 'Bắt buộc phải nhập lý do khi từ chối giao dịch' })
  @IsString()
  remarks?: string;
}
