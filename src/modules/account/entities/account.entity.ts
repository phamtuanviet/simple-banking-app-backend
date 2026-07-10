import { User } from 'src/modules/user/user.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  DeleteDateColumn,
} from 'typeorm';

@Entity('accounts')
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_number', type: 'varchar', unique: true, length: 20 })
  accountNumber: string;

  // Bắt buộc dùng numeric/decimal cho tiền tệ, không dùng float
  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0 })
  balance: number;

  @Column({ type: 'varchar', default: 'VND' })
  currency: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) // Không cho xóa User nếu còn Account
  @JoinColumn({ name: 'user_id' })
  user: User;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date;
}
