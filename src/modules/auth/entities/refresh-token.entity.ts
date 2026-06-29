import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../../user/user.entity';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Băm token để bảo mật giống hệt mật khẩu
  @Column({ name: 'hashed_token', type: 'varchar' })
  hashedToken: string;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt: Date;

  // Tùy chọn nâng cao: Lưu thiết bị (Ví dụ: 'Chrome on Windows', 'iPhone 15')
  @Column({ name: 'user_agent', type: 'varchar', nullable: true })
  userAgent: string;

  @Column({ name: 'ip_address', type: 'varchar', nullable: true })
  ipAddress: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  // Liên kết N-1 với bảng User
  @ManyToOne(() => User, (user) => user.refreshTokens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
