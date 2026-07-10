import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  JoinColumn,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { Transaction } from './transaction.entity';
import { User } from 'src/modules/user/user.entity';

export enum ApprovalAction {
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('transaction_approvals')
export class TransactionApproval {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Trỏ về giao dịch cần duyệt
  @ManyToOne(() => Transaction)
  @JoinColumn({ name: 'transaction_id' })
  transaction: Transaction;

  // Người thực hiện duyệt (Admin/Teller)
  @ManyToOne(() => User)
  @JoinColumn({ name: 'checker_id' })
  checker: User;

  @Column({ type: 'enum', enum: ApprovalAction })
  action: ApprovalAction;

  // Lý do từ chối hoặc ghi chú lúc duyệt
  @Column({ type: 'text', nullable: true })
  remarks: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
