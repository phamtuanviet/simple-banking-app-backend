import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  constructor(private readonly mailerService: MailerService) {}

  async sendVerificationEmail(email: string, token: string) {
    // Đường dẫn này thường trỏ về Frontend, Frontend sẽ gọi API verify của Backend
    const verifyUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;

    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Xác nhận đăng ký tài khoản',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h3>Chào bạn,</h3>
            <p>Cảm ơn bạn đã đăng ký tài khoản. Vui lòng click vào nút bên dưới để xác nhận địa chỉ email của bạn:</p>
            <a href="${verifyUrl}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Xác nhận Email
            </a>
            <p><em>Lưu ý: Link này sẽ hết hạn sau 24 giờ.</em></p>
            <p>Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này.</p>
          </div>
        `,
      });
      console.log(`Đã gửi email xác nhận tới: ${email}`);
    } catch (error) {
      console.error('Lỗi khi gửi email:', error);
      // Bạn có thể chọn throw lỗi hoặc chỉ log ra tùy nghiệp vụ, thường thì gửi mail lỗi vẫn cho phép user đăng ký thành công và có nút "Gửi lại mail" ở FE.
      throw new InternalServerErrorException(
        'Không thể gửi email xác nhận lúc này.',
      );
    }
  }

  async sendPasswordResetEmail(email: string, token: string) {
    // Đường dẫn này trỏ về trang Nhập Mật Khẩu Mới của Frontend
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Yêu cầu đặt lại mật khẩu',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h3>Chào bạn,</h3>
            <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.</p>
            <p>Vui lòng click vào nút bên dưới để tạo mật khẩu mới:</p>
            <a href="${resetUrl}" style="background-color: #f44336; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Đặt Lại Mật Khẩu
            </a>
            <p><em>Lưu ý: Link này chỉ có hiệu lực trong vòng 15 phút.</em></p>
            <p>Nếu bạn không yêu cầu đổi mật khẩu, hãy bỏ qua email này. Tài khoản của bạn vẫn an toàn.</p>
          </div>
        `,
      });
      console.log(`Đã gửi email khôi phục mật khẩu tới: ${email}`);
    } catch (error) {
      console.error('Lỗi khi gửi email khôi phục:', error);
      // Không throw exception ở đây để thực hiện Fire-and-Forget
    }
  }
}
