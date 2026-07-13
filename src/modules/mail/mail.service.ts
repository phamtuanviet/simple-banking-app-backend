import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  constructor(private readonly mailerService: MailerService) {}

  async sendVerificationEmail(email: string, token: string) {
    // Đường dẫn này thường trỏ về Frontend, Frontend sẽ gọi API verify của Backend
    const verifyUrl = `${process.env.FONTEND_URL}/verify-email?token=${token}`;

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
    const resetUrl = `${process.env.FONTEND_URL}/reset-password?token=${token}`;

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

  async sendOtpEmail(
    email: string,
    otpCode: string,
    amount: number,
    toAccountNumber: string,
    fullName: string = 'Quý khách',
  ) {
    try {
      // Định dạng số tiền sang dạng hiển thị có dấu chấm (Ví dụ: 10,000,000)
      const formattedAmount = new Intl.NumberFormat('vi-VN').format(amount);

      await this.mailerService.sendMail({
        to: email,
        subject: '[JITS] Mã xác thực OTP giao dịch chuyển tiền',
        html: `
          <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            <div style="background-color: #003366; padding: 25px; text-align: center;">
              <h2 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 1px;">JITS BANKING</h2>
            </div>
            
            <div style="padding: 30px; background-color: #ffffff; color: #333333; line-height: 1.6;">
              <p style="font-size: 16px;">Xin chào <strong>${fullName}</strong>,</p>
              <p style="font-size: 16px;">Chúng tôi nhận được yêu cầu xác thực cho giao dịch chuyển tiền với thông tin như sau:</p>
              
              <div style="background-color: #f8f9fa; padding: 15px; border-radius: 6px; margin: 20px 0; font-size: 15px;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 5px 0; color: #666666; width: 40%;">Số tài khoản nhận:</td>
                    <td style="padding: 5px 0; font-weight: bold; color: #003366;">${toAccountNumber}</td>
                  </tr>
                  <tr>
                    <td style="padding: 5px 0; color: #666666;">Số tiền giao dịch:</td>
                    <td style="padding: 5px 0; font-weight: bold; color: #d9534f;">${formattedAmount} VND</td>
                  </tr>
                </table>
              </div>

              <p style="font-size: 16px; text-align: center; margin-top: 25px; mb-5">Mã xác thực OTP (vui lòng không chia sẻ) của bạn là:</p>
              
              <div style="text-align: center; margin: 20px 0;">
                <div style="display: inline-block; background-color: #f1f3f5; border: 1px dashed #0056b3; padding: 15px 40px; font-size: 32px; font-weight: bold; color: #0056b3; letter-spacing: 6px; border-radius: 6px;">
                  ${otpCode}
                </div>
              </div>
              
              <div style="background-color: #fdf2f2; border-left: 4px solid #d9534f; padding: 15px; margin: 25px 0 10px 0;">
                <p style="font-size: 14px; color: #a94442; margin: 0;">
                  <strong>⚠️ CẢNH BÁO AN TOÀN:</strong> Mã OTP có hiệu lực trong vòng <strong>5 phút</strong>. Nhân viên ngân hàng <strong>KHÔNG BAO GIỜ</strong> yêu cầu bạn cung cấp mã OTP. Nếu bạn không thực hiện giao dịch này, vui lòng liên hệ ngay với hotline hỗ trợ để khóa tài khoản khẩn cấp.
                </p>
              </div>
            </div>
            
            <div style="background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #6c757d; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0 0 5px 0;">Đây là email tự động bảo mật cao, vui lòng không phản hồi.</p>
              <p style="margin: 0;">&copy; ${new Date().getFullYear()} JITS Innovation Labs. All rights reserved.</p>
            </div>
          </div>
        `,
      });
      console.log(`Đã gửi email OTP tới: ${email}`);
    } catch (error) {
      console.error('Lỗi khi gửi email OTP:', error);
      // Với luồng OTP, nếu gửi mail lỗi thì bắt buộc phải chặn luồng chuyển tiền
      // vì khách hàng sẽ không có mã để nhập ở bước sau.
      throw new InternalServerErrorException(
        'Hệ thống không thể gửi mã OTP vào lúc này. Vui lòng thử lại sau.',
      );
    }
  }

  async sendSecurityAlert(to: string, subject: string, message: string) {
    // Tùy biến lại theo template email thực tế của bạn
    await this.mailerService.sendMail({
      to: to,
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #d9534f;">Cảnh báo bảo mật</h2>
          <p>${message}</p>
          <p>Nếu bạn không thực hiện thao tác này, vui lòng liên hệ bộ phận hỗ trợ ngay lập tức để khóa tài khoản.</p>
        </div>
      `,
    });
  }

  async sendTransactionAlert(
    email: string,
    subject: string,
    message: string,
    fullName: string = 'Quý khách',
  ) {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: `[JITS] ${subject}`,
        html: `
          <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            <div style="background-color: #003366; padding: 25px; text-align: center;">
              <h2 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 1px;">JITS BANKING</h2>
            </div>
            
            <div style="padding: 30px; background-color: #ffffff; color: #333333; line-height: 1.6;">
              <p style="font-size: 16px;">Xin chào <strong>${fullName}</strong>,</p>
              
              <div style="background-color: #fdf2f2; border-left: 4px solid #d9534f; padding: 15px; margin: 20px 0;">
                <p style="font-size: 15px; color: #333333; margin: 0;">
                  ${message}
                </p>
              </div>

              <p style="font-size: 14px;">Nếu quý khách có bất kỳ thắc mắc nào về quyết định này, vui lòng mang theo Giấy tờ tùy thân (CCCD) ra quầy giao dịch gần nhất hoặc liên hệ Hotline bộ phận CSKH để được hỗ trợ.</p>
            </div>
            
            <div style="background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #6c757d; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0 0 5px 0;">Đây là email tự động, vui lòng không phản hồi.</p>
              <p style="margin: 0;">&copy; ${new Date().getFullYear()} JITS Innovation Labs. All rights reserved.</p>
            </div>
          </div>
        `,
      });
      console.log(`Đã gửi email thông báo giao dịch tới: ${email}`);
    } catch (error) {
      console.error('Lỗi khi gửi email thông báo giao dịch:', error);
      // Sử dụng luồng Fire-and-Forget: Lỗi gửi mail không được phép làm gián đoạn transaction
    }
  }
}
