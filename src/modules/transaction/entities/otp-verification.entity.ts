import { User } from 'src/modules/user/user.entity';
import { Transaction } from './transaction.entity';

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne, // Đổi OneToOne thành ManyToOne sẽ an toàn hơn
  JoinColumn,
} from 'typeorm';

@Entity('otp_verifications')
export class OtpVerification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ==========================================
  // 1. LIÊN KẾT (RELATIONS)
  // ==========================================

  // Cho phép nullable: true vì OTP bảo mật sẽ không có transaction
  @ManyToOne(() => Transaction, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transaction_id' })
  transaction: Transaction;

  // [THÊM MỚI] Liên kết trực tiếp với User cho các luồng phi-giao dịch
  @ManyToOne(() => User, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  // ==========================================
  // 2. DỮ LIỆU CỐT LÕI (CORE DATA)
  // ==========================================

  @Column({ name: 'otp_hash', type: 'varchar' })
  otpHash: string;

  // [THÊM MỚI] Dùng để lưu nháp dữ liệu (Ví dụ: Email mới đang chờ xác nhận)
  @Column({ type: 'varchar', nullable: true })
  metadata: string | null;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt: Date;

  @Column({ name: 'failed_attempts', type: 'int', default: 0 })
  failedAttempts: number;

  @Column({ name: 'resend_count', type: 'int', default: 0 })
  resendCount: number;

  // ==========================================
  // 3. TIMESTAMPS
  // ==========================================

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
