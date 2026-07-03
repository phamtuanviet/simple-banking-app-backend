import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Transaction } from '../transaction/entities/transaction.entity';
import { User } from '../user/user.entity';

// 1. Phân loại nội dung để Frontend biết cách render icon/màu sắc
export enum NotificationType {
  TRANSFER_IN = 'transfer_in',
  TRANSFER_OUT = 'transfer_out',
  SYSTEM = 'system',
  SECURITY = 'security',
}

// 2. Trạng thái để Backend biết cái nào cần gửi Socket, cái nào lỗi mạng cần gửi lại
export enum NotificationStatus {
  PENDING = 'pending', // Chờ Socket gửi đi
  SENT = 'sent', // Socket đã gửi thành công
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ==========================================
  // NHÓM 1: LIÊN KẾT CƠ BẢN
  // ==========================================
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Transaction, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'transaction_id' })
  transaction: Transaction | null;

  // ==========================================
  // NHÓM 2: NỘI DUNG HIỂN THỊ (UI/UX)
  // ==========================================
  @Column({ type: 'enum', enum: NotificationType })
  type: NotificationType;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  amount: number | null;

  @Column({
    name: 'balance_after_transaction',
    type: 'decimal',
    precision: 15,
    scale: 2,
    nullable: true,
  })
  balanceAfterTransaction: number | null;

  // ==========================================
  // NHÓM 3: QUẢN LÝ TRẠNG THÁI (NGHIỆP VỤ)
  // ==========================================

  // Frontend dùng cái này để đếm chấm đỏ (Unread badge)
  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead: boolean;

  // Backend dùng cái này để Cron Job quét và nhả Socket (Outbox Pattern)
  @Column({
    type: 'enum',
    enum: NotificationStatus,
    default: NotificationStatus.PENDING,
  })
  status: NotificationStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
