import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt'; // Nếu bạn muốn tự xác thực token ở socket

// Cấu hình CORS để React có thể gọi tới
@WebSocketGateway({ cors: { origin: '*' } })
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  constructor(private jwtService: JwtService) {}

  // Khi có một thiết bị (tab trình duyệt) kết nối tới
  handleConnection(client: Socket) {
    try {
      // 1. Lấy token từ header hoặc query
      const token = client.handshake.auth.token?.split(' ')[1];
      if (!token) return client.disconnect();

      // 2. Giải mã token để lấy userId
      const payload = this.jwtService.verify(token);
      const userId = payload.sub;

      // 3. Đưa user này vào một "phòng" mang tên chính ID của họ
      client.join(`user_${userId}`);
      console.log(`Client kết nối và vào phòng: user_${userId}`);
    } catch (_error) {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`Client ngắt kết nối: ${client.id}`);
  }

  // Hàm tiện ích để service khác gọi vào
  notifyUser(userId: string, eventName: string, data: any) {
    this.server.to(`user_${userId}`).emit(eventName, data);
  }
}
