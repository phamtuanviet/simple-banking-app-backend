import { Account } from 'src/modules/account/entities/account.entity';
import { Transaction } from 'src/modules/transaction/entities/transaction.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

export enum LedgerEntryType {
  DEBIT = 'debit', // Ghi nợ (Trừ tiền)
  CREDIT = 'credit', // Ghi có (Cộng tiền)
}

@Entity('ledger_entries')
export class LedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: LedgerEntryType })
  type: LedgerEntryType;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  amount: number;

  @Column({ name: 'balance_after', type: 'numeric', precision: 18, scale: 2 })
  balanceAfter: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Account, { nullable: false })
  @JoinColumn({ name: 'account_id' })
  account: Account;

  @ManyToOne(() => Transaction, { nullable: false })
  @JoinColumn({ name: 'transaction_id' })
  transaction: Transaction;
}
