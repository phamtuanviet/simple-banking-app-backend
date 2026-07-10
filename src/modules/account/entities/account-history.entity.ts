import { Account } from 'src/modules/account/entities/account.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

@Entity('account_history')
export class AccountHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Account, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'account_id' })
  account: Account;

  // Lưu toàn bộ snapshot của tài khoản trước khi bị ghi đè
  @Column({ name: 'previous_data', type: 'jsonb' })
  previousData: any;

  @Column({ name: 'changed_by_id', type: 'uuid', nullable: true })
  changedById: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
