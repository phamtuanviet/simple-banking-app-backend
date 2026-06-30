import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
/* eslint-disable @typescript-eslint/no-unused-vars */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      throw (
        err ||
        new UnauthorizedException(
          'Bạn cần đăng nhập để thực hiện chức năng này!',
        )
      );
    }
    return user;
  }
}
