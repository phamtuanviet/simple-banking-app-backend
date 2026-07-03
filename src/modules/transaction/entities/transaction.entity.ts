import { Account } from 'src/modules/account/entities/account.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

export enum TransactionType {
  TRANSFER = 'transfer',
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
}

export enum TransactionStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
}

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  amount: number;

  @Column({ type: 'enum', enum: TransactionType })
  type: TransactionType;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  status: TransactionStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  // Tài khoản nguồn (người gửi)
  @ManyToOne(() => Account, { nullable: true })
  @JoinColumn({ name: 'from_account_id' })
  fromAccount: Account;

  // Tài khoản đích (người nhận)
  @ManyToOne(() => Account, { nullable: true })
  @JoinColumn({ name: 'to_account_id' })
  toAccount: Account;

  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    unique: true,
    nullable: true,
  })
  idempotencyKey: string;
}
