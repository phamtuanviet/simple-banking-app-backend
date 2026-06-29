import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  success: boolean;
  data: T;
}

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((controllerResult) => {
        // 1. Lấy statusCode hiện tại của Response
        const statusCode = context.switchToHttp().getResponse().statusCode;

        // 2. Mặc định message là 'Thao tác thành công' nếu controller không truyền gì
        let message = 'Thao tác thành công';
        let finalData = controllerResult;

        // 3. Nếu Controller trả về một Object (như cục {} ở hàm login/register)
        if (
          controllerResult &&
          typeof controllerResult === 'object' &&
          !Array.isArray(controllerResult)
        ) {
          // Nếu có trường message custom từ Controller, bóc nó ra
          if (controllerResult.message) {
            message = controllerResult.message;
          }

          // Tiến hành bóc tách: loại bỏ các trường hệ thống như 'message', 'success' ra khỏi data thực tế
          const { message: _, success: __, ...rest } = controllerResult;

          // Nếu sau khi loại bỏ, trong object chỉ còn đúng 1 trường dữ liệu (ví dụ: 'user' hoặc 'userId')
          // Ta có thể lôi thẳng dữ liệu đó ra ngoài cho đẹp, nếu có nhiều trường thì giữ nguyên object
          const keys = Object.keys(rest);
          if (keys.length === 1) {
            finalData = rest[keys[0]]; // Lấy thẳng dữ liệu bên trong (ví dụ: lấy thẳng object user)
          } else {
            finalData = rest;
          }
        }

        // 4. Trả về cấu trúc chuẩn chỉnh nhất cho Frontend
        return {
          success: true,
          statusCode,
          message,
          data: finalData || null,
        };
      }),
    );
  }
}
