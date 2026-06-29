import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

import { OneToMany } from 'typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';

// Định nghĩa Enum cho Role và Status
export enum UserRole {
  CUSTOMER = 'customer',
  ADMIN = 'admin',
}

export enum UserStatus {
  ACTIVE = 'active',
  LOCKED = 'locked',
  BANNED = 'banned', // Thêm trạng thái cấm vĩnh viễn nếu cần
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'full_name', type: 'varchar', length: 100 })
  fullName: string;

  @Column({ type: 'varchar', unique: true })
  email: string;

  @Column({ name: 'password_hash', type: 'varchar' })
  passwordHash: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.CUSTOMER })
  role: UserRole;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  // ==========================================
  // NHÓM 1: XÁC NHẬN EMAIL (EMAIL VERIFICATION)
  // ==========================================

  @Column({ name: 'is_email_verified', type: 'boolean', default: false })
  isEmailVerified: boolean;

  @Column({ name: 'email_verification_token', type: 'varchar', nullable: true })
  emailVerificationToken: string | null;

  @Column({
    name: 'email_verification_expires_at',
    type: 'timestamp',
    nullable: true,
  })
  emailVerificationExpiresAt: Date | null;

  // ==========================================
  // NHÓM 2: QUÊN/ĐỔI MẬT KHẨU (PASSWORD RESET)
  // ==========================================
  @Column({ name: 'reset_password_token', type: 'varchar', nullable: true })
  resetPasswordToken: string;

  @Column({
    name: 'reset_password_expires_at',
    type: 'timestamp',
    nullable: true,
  })
  resetPasswordExpiresAt: Date;

  // ==========================================
  // NHÓM 3: BẢO MẬT & CHỐNG TẤN CÔNG (SECURITY)
  // ==========================================

  @Column({ name: 'hashed_refresh_token', type: 'varchar', nullable: true })
  hashedRefreshToken: string;

  @Column({ name: 'failed_login_attempts', type: 'int', default: 0 })
  failedLoginAttempts: number;

  @Column({ name: 'lockout_until', type: 'timestamp', nullable: true })
  lockoutUntil: Date | null;

  // ==========================================
  // NHÓM 4: TIMESTAMPS & SOFT DELETE
  // ==========================================

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({
    name: 'last_verification_sent_at',
    type: 'timestamp',
    nullable: true,
  })
  lastVerificationSentAt: Date;

  // Soft delete: Không bao giờ xóa hẳn user, chỉ đánh dấu ngày xóa
  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date;

  @OneToMany(() => RefreshToken, (refreshToken) => refreshToken.user)
  refreshTokens: RefreshToken[];
}
