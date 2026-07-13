import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import {
  Repository,
  DataSource,
  Between,
  MoreThanOrEqual,
  LessThanOrEqual,
} from 'typeorm';
import { Account } from '../account/entities/account.entity';
import { TransferDto } from './dto/transfer.dto';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from './entities/transaction.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Notification,
  NotificationStatus,
  NotificationType,
} from '../notification/notification.entity';
import {
  LedgerEntry,
  LedgerEntryType,
} from '../ledger-entry/entities/ledger-entry.entity';
import { OtpVerification } from './entities/otp-verification.entity';
import {
  ApprovalAction,
  TransactionApproval,
} from './entities/transaction-approval.entity';
import { MailService } from '../mail/mail.service';
import { User } from '../user/user.entity';
import { CashTransactionDto } from './dto/cash-transaction.dto';

export interface TransactionFilters {
  status?: string;
  startDate?: string;
  endDate?: string;
  flow?: 'in' | 'out';
}

@Injectable()
export class TransactionService {
  // Cấu hình hạn mức (Nên đưa vào biến môi trường .env)
  private readonly OTP_THRESHOLD = 10000000; // 10 triệu
  private readonly APPROVAL_THRESHOLD = 500000000; // 500 triệu
  private readonly WITHDRAWAL_APPROVAL_THRESHOLD = 500000000;
  private readonly MAX_OTP_ATTEMPTS = 3;
  private readonly MAX_RESEND_LIMIT = 3;

  constructor(
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(Transaction)
    private transactionRepo: Repository<Transaction>,
    @InjectRepository(Account) private accountRepo: Repository<Account>,
    @InjectRepository(OtpVerification)
    private otpRepo: Repository<OtpVerification>, // [MỚI]
    @InjectRepository(TransactionApproval)
    private approvalRepo: Repository<TransactionApproval>,
    private mailService: MailService,
  ) {}

  async initiateTransfer(
    userId: string,
    transferDto: TransferDto,
    idempotencyKey: string,
  ) {
    const { toAccountNumber, amount, description } = transferDto;

    // 1. Chống trùng lặp (Idempotency)
    const existingTx = await this.transactionRepo.findOne({
      where: { idempotencyKey },
    });
    if (existingTx) {
      return {
        success: true,
        message: 'Giao dịch đã được ghi nhận',
        transactionId: existingTx.id,
        status: existingTx.status,
      };
    }

    // 2. Lấy thông tin tài khoản (Kiểm tra nhanh, KHÔNG khóa row)
    const senderAccount = await this.accountRepo.findOne({
      where: { user: { id: userId } },
      relations: { user: true },
    });
    const receiverAccount = await this.accountRepo.findOne({
      where: { accountNumber: toAccountNumber, isActive: true },
      relations: { user: true },
    });

    if (!senderAccount)
      throw new BadRequestException('Không tìm thấy tài khoản nguồn.');
    if (!receiverAccount)
      throw new BadRequestException(
        'Tài khoản đích không tồn tại hoặc bị khóa.',
      );
    if (senderAccount.accountNumber === toAccountNumber)
      throw new BadRequestException('Không thể tự chuyển khoản.');

    if (parseFloat(senderAccount.balance.toString()) < amount) {
      throw new BadRequestException('Số dư khả dụng không đủ.');
    }

    // 3. Phân luồng rủi ro (Routing State)
    let initialStatus = TransactionStatus.PROCESSING; // Luồng tự động mặc định

    if (amount >= this.APPROVAL_THRESHOLD) {
      initialStatus = TransactionStatus.PENDING_APPROVAL;
    } else if (amount >= this.OTP_THRESHOLD) {
      initialStatus = TransactionStatus.PENDING_OTP;
    }

    console.log('Transaction status:1' + initialStatus);

    // 4. Lưu bản ghi Transaction định danh
    const transaction = this.transactionRepo.create({
      amount,
      type: TransactionType.TRANSFER,
      status: initialStatus,
      description: description || `Chuyển tiền tới ${toAccountNumber}`,
      fromAccount: senderAccount,
      toAccount: receiverAccount,
      idempotencyKey,
    });
    const savedTx = await this.transactionRepo.save(transaction);

    if (initialStatus === TransactionStatus.PENDING_OTP) {
      const plainOtp = Math.floor(100000 + Math.random() * 900000).toString();

      const saltRounds = 10;
      const hashedOtp = await bcrypt.hash(plainOtp, saltRounds);

      // 1. Lưu OTP vào bảng otp_verifications (như code trước)
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 5);
      await this.otpRepo.save({
        transaction: savedTx,
        otpHash: hashedOtp,
        expiresAt,
      });

      // 2. Gọi MailService để gửi trực tiếp thông tin và mã OTP
      this.mailService.sendOtpEmail(
        senderAccount.user.email,
        plainOtp,
        amount,
        toAccountNumber,
        senderAccount.user.fullName,
      );
    }

    // 5. Xử lý dựa trên trạng thái
    if (initialStatus === TransactionStatus.PROCESSING) {
      // Nếu là luồng tự động (dưới 10tr), gọi tiếp hàm xử lý Core DB Transaction
      console.log('Processing transaction');
      return await this.executeTransactionCore(savedTx.id);
    }

    console.log('Transaction status:2' + initialStatus);

    // Nếu cần OTP hoặc Duyệt, trả về trạng thái để Client điều hướng
    return {
      message:
        initialStatus === TransactionStatus.PENDING_OTP
          ? 'Vui lòng xác thực OTP'
          : 'Giao dịch đang chờ kiểm duyệt',
      transactionId: savedTx.id,
      status: initialStatus,
    };
  }

  public async executeTransactionCore(transactionId: string) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Lấy lại giao dịch (Lấy cả relations nhưng cẩn thận có thể bị null với Nạp/Rút)
      const tx = await queryRunner.manager.findOne(Transaction, {
        where: { id: transactionId },
        relations: {
          fromAccount: { user: true },
          toAccount: { user: true },
        },
      });

      if (!tx) {
        throw new BadRequestException(
          'Không tìm thấy giao dịch trong hệ thống.',
        );
      }

      // ==========================================
      // 1. KỸ THUẬT CHỐNG DEADLOCK TỔNG QUÁT
      // ==========================================
      const accountIdsToLock: string[] = [];
      if (tx.fromAccount) accountIdsToLock.push(tx.fromAccount.id);
      if (tx.toAccount) accountIdsToLock.push(tx.toAccount.id);

      // Sắp xếp ID tăng dần để chống khóa chéo
      accountIdsToLock.sort();

      if (accountIdsToLock.length > 0) {
        // Tạo query động theo số lượng account cần khóa ($1, $2)
        const placeholders = accountIdsToLock
          .map((_, i) => `$${i + 1}`)
          .join(', ');
        await queryRunner.manager.query(
          `SELECT id FROM accounts WHERE id IN (${placeholders}) FOR UPDATE`,
          accountIdsToLock,
        );
      }

      // Lấy data mới nhất sau khi đã khóa an tocreateNotificationàn
      let senderAcc: Account | null = null;
      let receiverAcc: Account | null = null;

      if (tx.fromAccount) {
        senderAcc = await queryRunner.manager.findOne(Account, {
          where: { id: tx.fromAccount.id },
          relations: { user: true },
        });
        if (!senderAcc)
          throw new BadRequestException('Không tìm thấy tài khoản nguồn.');
      }

      if (tx.toAccount) {
        receiverAcc = await queryRunner.manager.findOne(Account, {
          where: { id: tx.toAccount.id },
          relations: { user: true },
        });
        if (!receiverAcc)
          throw new BadRequestException('Không tìm thấy tài khoản đích.');
      }

      const amountToTransfer = parseFloat(tx.amount.toString());

      // ==========================================
      // 2. KIỂM TRA SỐ DƯ (Chỉ áp dụng nếu có tài khoản nguồn bị trừ tiền)
      // ==========================================
      if (senderAcc) {
        if (parseFloat(senderAcc.balance.toString()) < amountToTransfer) {
          throw new BadRequestException(
            'Số dư không đủ tại thời điểm đối soát.',
          );
        }
        // Cập nhật số dư người gửi (TRANSFER, WITHDRAWAL)
        senderAcc.balance =
          parseFloat(senderAcc.balance.toString()) - amountToTransfer;
      }

      if (receiverAcc) {
        // Cập nhật số dư người nhận (TRANSFER, DEPOSIT)
        receiverAcc.balance =
          parseFloat(receiverAcc.balance.toString()) + amountToTransfer;
      }

      // Lưu các tài khoản có biến động
      const accountsToSave = [senderAcc, receiverAcc].filter(
        (acc) => acc !== null,
      );
      if (accountsToSave.length > 0) {
        await queryRunner.manager.save(Account, accountsToSave);
      }

      // ==========================================
      // 3. SỔ CÁI (Ledger) VÀ NOTIFICATION
      // ==========================================
      const ledgerEntries: LedgerEntry[] = [];
      const notifications: any[] = [];

      const eventTargets: { notifIndex: number; userId: string }[] = [];

      // Xử lý nhánh NỢ (Debit) & Thông báo TRỪ TIỀN
      if (senderAcc) {
        ledgerEntries.push(
          queryRunner.manager.create(LedgerEntry, {
            type: LedgerEntryType.DEBIT,
            amount: amountToTransfer,
            balanceAfter: senderAcc.balance,
            account: senderAcc,
            transaction: tx,
          }),
        );

        const notifType =
          tx.type === TransactionType.WITHDRAWAL
            ? NotificationType.WITHDRAWAL
            : NotificationType.TRANSFER_OUT;
        notifications.push(
          this.createNotification(
            senderAcc,
            notifType,
            amountToTransfer,
            senderAcc.balance,
            tx,
          ),
        );

        // Nhớ lại userId của người gửi ở vị trí index tương ứng
        eventTargets.push({
          notifIndex: notifications.length - 1,
          userId: senderAcc.user.id,
        });
      }

      // Xử lý nhánh CÓ (Credit) & Thông báo NHẬN TIỀN
      if (receiverAcc) {
        ledgerEntries.push(
          queryRunner.manager.create(LedgerEntry, {
            type: LedgerEntryType.CREDIT,
            amount: amountToTransfer,
            balanceAfter: receiverAcc.balance,
            account: receiverAcc,
            transaction: tx,
          }),
        );

        const notifType =
          tx.type === TransactionType.DEPOSIT
            ? NotificationType.DEPOSIT
            : NotificationType.TRANSFER_IN;
        notifications.push(
          this.createNotification(
            receiverAcc,
            notifType,
            amountToTransfer,
            receiverAcc.balance,
            tx,
          ),
        );

        // Nhớ lại userId của người nhận ở vị trí index tương ứng
        eventTargets.push({
          notifIndex: notifications.length - 1,
          userId: receiverAcc.user.id,
        });
      }

      // Lưu hàng loạt Sổ cái và Thông báo
      if (ledgerEntries.length > 0)
        await queryRunner.manager.save(LedgerEntry, ledgerEntries);
      let savedNotifications: any[] = [];
      if (notifications.length > 0) {
        savedNotifications = await queryRunner.manager.save(
          Notification,
          notifications,
        );
      }

      // ==========================================
      // 4. CHỐT GIAO DỊCH VÀ BẮN SỰ KIỆN
      // ==========================================
      tx.status = TransactionStatus.COMPLETED;
      await queryRunner.manager.save(Transaction, tx);

      await queryRunner.commitTransaction();

      // Bắn sự kiện chạy ngầm cho tất cả notification được sinh ra
      for (const target of eventTargets) {
        this.eventEmitter.emit('notification.created', {
          notificationId: savedNotifications[target.notifIndex].id,
          userId: target.userId, // Đảm bảo 100% không bao giờ bị undefined
        });
      }

      return {
        success: true,
        message: 'Xử lý giao dịch thành công',
        transactionId: tx.id,
        status: tx.status,
      };
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }

      // Chuyển trạng thái giao dịch thành FAILED ở một kết nối độc lập
      await this.transactionRepo.update(transactionId, {
        status: TransactionStatus.FAILED,
      });

      console.error(`[Transaction FAILED] ID: ${transactionId} - Lỗi:`, error);

      throw new InternalServerErrorException(
        error.message || 'Lỗi hệ thống khi xử lý dòng tiền.',
      );
    } finally {
      await queryRunner.release();
    }
  }

  // Hàm hỗ trợ tạo Notification Entity cho gọn code
  public createNotification(
    account: Account,
    type: NotificationType,
    amount: number | string, // Khai báo thêm string để bắt lỗi TypeORM
    balance: number | string,
    tx: Transaction,
  ) {
    const notif = new Notification();
    notif.user = account.user;
    notif.type = type;

    // Ép kiểu chắc chắn trước khi lưu vào thực thể Notification
    const safeAmount = Number(amount);
    const safeBalance = Number(balance);

    notif.amount = safeAmount;
    notif.balanceAfterTransaction = safeBalance;
    notif.transaction = tx;
    notif.status = NotificationStatus.PENDING;

    // Định dạng chuỗi hiển thị
    const formattedAmount = safeAmount.toLocaleString('vi-VN');

    if (type === NotificationType.TRANSFER_OUT) {
      notif.title = 'Chuyển tiền thành công';
      notif.message = `Bạn đã chuyển ${formattedAmount} VND.`;
    } else {
      notif.title = 'Nhận tiền thành công';
      notif.message = `Bạn đã nhận ${formattedAmount} VND.`;
    }

    return notif;
  }

  async confirmOtpTransfer(
    userId: string,
    transactionId: string,
    otpCode: string,
  ) {
    // Lấy giao dịch
    const tx = await this.transactionRepo.findOne({
      where: { id: transactionId },
      relations: { fromAccount: { user: true } },
    });
    if (!tx || tx.fromAccount.user.id !== userId)
      throw new BadRequestException('Giao dịch không hợp lệ');
    if (tx.status !== TransactionStatus.PENDING_OTP)
      throw new BadRequestException('Giao dịch không chờ OTP');

    // ==========================================
    // [MỚI] TRUY VẤN VÀ KIỂM TRA BẢNG OTP
    // ==========================================
    const otpRecord = await this.otpRepo.findOne({
      where: { transaction: { id: transactionId } },
    });

    if (!otpRecord) throw new BadRequestException('Không tìm thấy dữ liệu OTP');

    // 1. Kiểm tra hết hạn
    if (new Date() > otpRecord.expiresAt) {
      await this.transactionRepo.update(tx.id, {
        status: TransactionStatus.FAILED,
      });
      throw new BadRequestException('Mã OTP đã hết hạn. Giao dịch bị hủy.');
    }

    // 2. So sánh mã (Ở thực tế sẽ dùng bcrypt.compare)
    const isValidOtp = await bcrypt.compare(otpCode, otpRecord.otpHash);

    if (!isValidOtp) {
      // Tăng biến đếm nhập sai
      otpRecord.failedAttempts += 1;
      await this.otpRepo.save(otpRecord);

      if (otpRecord.failedAttempts >= this.MAX_OTP_ATTEMPTS) {
        await this.transactionRepo.update(tx.id, {
          status: TransactionStatus.FAILED,
        });
        throw new BadRequestException(
          'Nhập sai OTP quá 3 lần. Giao dịch bị hủy.',
        );
      }

      throw new BadRequestException(
        `OTP không chính xác. Bạn còn ${this.MAX_OTP_ATTEMPTS - otpRecord.failedAttempts} lần thử.`,
      );
    }

    // 3. OTP Đúng -> XÓA bản ghi OTP để không dùng lại được nữa
    await this.otpRepo.delete(otpRecord.id);

    // 4. Chuyển trạng thái và xử lý tiền
    await this.transactionRepo.update(tx.id, {
      status: TransactionStatus.PROCESSING,
    });
    return this.executeTransactionCore(tx.id);
  }

  async approveTransfer(
    adminId: string,
    transactionId: string,
    action: ApprovalAction,
    remarks?: string,
  ) {
    const tx = await this.transactionRepo.findOne({
      where: { id: transactionId },
    });
    if (!tx || tx.status !== TransactionStatus.PENDING_APPROVAL)
      throw new BadRequestException('Giao dịch không chờ duyệt');

    // ==========================================
    // [MỚI] LƯU DẤU VẾT VÀO BẢNG APPROVAL
    // ==========================================
    const approvalRecord = this.approvalRepo.create({
      transaction: tx,
      checker: { id: adminId } as User, // Gắn ID Admin
      action: action,
      remarks: remarks || '',
    });
    await this.approvalRepo.save(approvalRecord);

    // Xử lý theo quyết định của Admin
    if (action === ApprovalAction.REJECTED) {
      // Từ chối -> Cập nhật Failed
      await this.transactionRepo.update(tx.id, {
        status: TransactionStatus.FAILED,
      });
      return { success: true, message: 'Đã từ chối giao dịch' };
    }

    // Phê duyệt -> Chuyển trạng thái và gọi xử lý tiền
    await this.transactionRepo.update(tx.id, {
      status: TransactionStatus.PROCESSING,
    });
    return this.executeTransactionCore(tx.id);
  }

  async resendOtp(userId: string, transactionId: string) {
    // 1. Tìm giao dịch và kiểm tra quyền sở hữu
    const tx = await this.transactionRepo.findOne({
      where: { id: transactionId },
      relations: {
        fromAccount: { user: true },
        toAccount: true,
      },
    });

    if (!tx) {
      throw new BadRequestException('Giao dịch không tồn tại.');
    }

    if (tx.fromAccount.user.id !== userId) {
      throw new BadRequestException(
        'Bạn không có quyền thực hiện thao tác trên giao dịch này.',
      );
    }

    // 2. Kiểm tra trạng thái State Machine xem có hợp lệ để gửi lại OTP không
    if (tx.status !== TransactionStatus.PENDING_OTP) {
      throw new BadRequestException(
        'Giao dịch không ở trạng thái chờ xác thực OTP.',
      );
    }

    // 3. Tìm bản ghi OTP hiện tại trong DB
    let otpRecord = await this.otpRepo.findOne({
      where: { transaction: { id: transactionId } },
    });

    // 4. CHỐNG SPAM (Cool-down check): Kiểm tra xem khoảng cách giữa lần tạo trước và hiện tại
    if (otpRecord) {
      const now = new Date().getTime();

      const lastSentTime = new Date(
        otpRecord.updatedAt || otpRecord.createdAt,
      ).getTime();

      const cooldownPeriod = 60 * 1000; // 1 phút

      if (now - lastSentTime < cooldownPeriod) {
        const secondsLeft = Math.ceil(
          (cooldownPeriod - (now - lastSentTime)) / 1000,
        );
        throw new BadRequestException(
          `Vui lòng đợi ${secondsLeft} giây trước khi yêu cầu gửi lại mã OTP mới.`,
        );
      }
    }

    // 5. Sinh mã OTP 6 số mới
    const plainOtp = Math.floor(100000 + Math.random() * 900000).toString();

    // 6. Băm (Hash) mã OTP mới để bảo mật tuyệt đối cho DB
    const saltRounds = 10;
    const hashedOtp = await bcrypt.hash(plainOtp, saltRounds);

    // 7. Thiết lập thời gian hết hạn mới (5 phút kể từ bây giờ)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5);

    if (otpRecord) {
      // Nếu đã có bản ghi, cập nhật thông tin và reset số lần nhập sai về 0
      otpRecord.otpHash = hashedOtp;
      otpRecord.expiresAt = expiresAt;
      otpRecord.failedAttempts = 0;
      await this.otpRepo.save(otpRecord);
    } else {
      // Trường hợp hiếm gặp: Giao dịch PENDING_OTP nhưng bản ghi OTP bị xóa mất, ta tạo mới
      otpRecord = this.otpRepo.create({
        transaction: tx,
        otpHash: hashedOtp,
        expiresAt: expiresAt,
        failedAttempts: 0,
      });
      await this.otpRepo.save(otpRecord);
    }

    // 8. Gửi lại Email chứa mã OTP mới và thông tin giao dịch để chống Phishing
    const amountToTransfer = parseFloat(tx.amount.toString());
    await this.mailService.sendOtpEmail(
      tx.fromAccount.user.email,
      plainOtp, // Gửi mã OTP nguyên bản (Plain)
      amountToTransfer,
      tx.toAccount.accountNumber,
      tx.fromAccount.user.fullName,
    );

    return {
      success: true,
      message: 'Mã OTP mới đã được gửi vào email của bạn.',
      transactionId: tx.id,
    };
  }

  async getTransactionHistory(
    userId: string,
    page: number = 1,
    limit: number = 10,
    filters?: TransactionFilters,
  ) {
    const account = await this.dataSource.manager.findOne(Account, {
      where: { user: { id: userId } },
    });

    if (!account) throw new BadRequestException('Không tìm thấy tài khoản');

    const skip = (page - 1) * limit;

    // 1. Tạo Base Filter (chứa điều kiện về status và thời gian)
    const baseFilter: any = {};

    if (filters?.status) {
      baseFilter.status = filters.status;
    }

    if (filters?.startDate || filters?.endDate) {
      if (filters.startDate && filters.endDate) {
        baseFilter.createdAt = Between(
          new Date(`${filters.startDate}T00:00:00.000Z`),
          new Date(`${filters.endDate}T23:59:59.999Z`),
        );
      } else if (filters.startDate) {
        baseFilter.createdAt = MoreThanOrEqual(
          new Date(`${filters.startDate}T00:00:00.000Z`),
        );
      } else if (filters.endDate) {
        baseFilter.createdAt = LessThanOrEqual(
          new Date(`${filters.endDate}T23:59:59.999Z`),
        );
      }
    }

    // 2. Xử lý điều kiện Flow (Tiền vào / Tiền ra)
    let whereCondition: any;

    if (filters?.flow === 'in') {
      // Tiền vào: Tài khoản của user là người nhận (toAccount)
      whereCondition = { toAccount: { id: account.id }, ...baseFilter };
    } else if (filters?.flow === 'out') {
      // Tiền ra: Tài khoản của user là người gửi (fromAccount)
      whereCondition = { fromAccount: { id: account.id }, ...baseFilter };
    } else {
      // Không lọc flow: Lấy cả tiền vào HOẶC tiền ra (Mảng [] trong TypeORM tương đương OR)
      whereCondition = [
        { fromAccount: { id: account.id }, ...baseFilter },
        { toAccount: { id: account.id }, ...baseFilter },
      ];
    }

    // 3. Thực thi query
    const [transactions, total] = await this.transactionRepo.findAndCount({
      where: whereCondition,
      relations: {
        fromAccount: true,
        toAccount: true,
      },
      order: { createdAt: 'DESC' }, // Giao dịch mới nhất lên đầu
      skip,
      take: limit,
    });

    const formattedItems = transactions.map((tx) => ({
      id: tx.id,
      fromAccountId: tx.fromAccount ? tx.fromAccount.id : null,
      toAccountId: tx.toAccount ? tx.toAccount.id : null,
      amount: parseFloat(tx.amount.toString()), // Ép kiểu về number
      type: tx.type,
      status: tx.status,
      description: tx.description,
      createdAt: tx.createdAt.toISOString(), // Chuyển Date object thành string chuẩn ISO
    }));

    return {
      items: formattedItems,
      total: total,
      page: page,
      limit: limit,
      lastPage: Math.ceil(total / limit),
    };
  }

  async deposit(dto: CashTransactionDto) {
    // 1. Kiểm tra tài khoản có tồn tại không (Chỉ Read, không cần Lock ở bước này)
    const customerAccount = await this.accountRepo.findOne({
      where: { accountNumber: dto.accountNumber },
    });
    if (!customerAccount) {
      throw new NotFoundException('Không tìm thấy tài khoản khách hàng');
    }

    // 2. Tạo bản ghi giao dịch (Hóa đơn)
    const tx = this.transactionRepo.create({
      amount: dto.amount,
      type: TransactionType.DEPOSIT,
      status: TransactionStatus.PROCESSING, // Sẵn sàng để xử lý
      description:
        dto.description ||
        `Nạp tiền mặt tại quầy vào TK ${customerAccount.accountNumber}`,
      toAccount: customerAccount,
    });
    const savedTx = await this.transactionRepo.save(tx);

    // 3. Quăng hóa đơn cho cỗ máy Core Banking xử lý dòng tiền
    return await this.executeTransactionCore(savedTx.id);
  }

  // ==========================================
  // API: RÚT TIỀN TẠI QUẦY (WITHDRAWAL)
  // ==========================================
  async withdraw(dto: CashTransactionDto) {
    // 1. Kiểm tra tài khoản và số dư sơ bộ
    const customerAccount = await this.accountRepo.findOne({
      where: { accountNumber: dto.accountNumber },
    });
    if (!customerAccount) {
      throw new NotFoundException('Không tìm thấy tài khoản khách hàng');
    }

    if (Number(customerAccount.balance) < dto.amount) {
      throw new BadRequestException(
        'Số dư tài khoản không đủ để thực hiện giao dịch rút tiền này.',
      );
    }

    // 2. Phân luồng rủi ro hạn mức (Hạn mức lớn >= 500Tr)
    if (dto.amount >= this.WITHDRAWAL_APPROVAL_THRESHOLD) {
      const tx = this.transactionRepo.create({
        amount: dto.amount,
        type: TransactionType.WITHDRAWAL,
        status: TransactionStatus.PENDING_APPROVAL, // Treo hóa đơn lại, CHƯA xử lý tiền
        description:
          dto.description ||
          `Rút tiền mặt giá trị lớn tại quầy từ TK ${customerAccount.accountNumber}`,
        fromAccount: customerAccount,
      });
      const savedTx = await this.transactionRepo.save(tx);

      return {
        success: true,
        transactionId: savedTx.id,
        status: savedTx.status,
        message:
          'Giao dịch rút tiền vượt hạn mức quầy. Đã chuyển sang trạng thái chờ Quản lý phê duyệt.',
      };
    }

    // 3. Giao dịch < 500Tr: Tạo hóa đơn và xử lý ngay
    const tx = this.transactionRepo.create({
      amount: dto.amount,
      type: TransactionType.WITHDRAWAL,
      status: TransactionStatus.PROCESSING,
      description:
        dto.description ||
        `Rút tiền mặt tại quầy từ TK ${customerAccount.accountNumber}`,
      fromAccount: customerAccount,
    });
    const savedTx = await this.transactionRepo.save(tx);

    // Quăng hóa đơn cho cỗ máy Core xử lý dòng tiền
    return await this.executeTransactionCore(savedTx.id);
  }
}
