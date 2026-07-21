import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

type JoinPayload = {
  userId?: number | string;
  role?: string;
};

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private readonly server!: Server;

  handleConnection(client: Socket): void {
    const userId = this.parseUserId(client.handshake.query.userId);
    const role = this.parseRole(client.handshake.query.role);

    if (userId) {
      this.joinNotificationRooms(client, userId, role);
    }
  }

  handleDisconnect(client: Socket): void {
    client.removeAllListeners();
  }

  @SubscribeMessage('notifications:join')
  join(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinPayload,
  ): { success: boolean } {
    const userId = this.parseUserId(payload?.userId);
    const role = this.parseRole(payload?.role);

    if (!userId) {
      return { success: false };
    }

    this.joinNotificationRooms(client, userId, role);
    return { success: true };
  }

  emitNotification(userId: number, role: string, notification: unknown): void {
    this.server
      .to(this.userRoom(userId))
      .emit('notification:new', notification);
  }

  private joinNotificationRooms(client: Socket, userId: number, role?: string) {
    client.join(this.userRoom(userId));

    if (role) {
      client.join(this.roleRoom(role));
    }
  }

  private userRoom(userId: number): string {
    return `user:${userId}`;
  }

  private roleRoom(role: string): string {
    return `role:${role.toLowerCase()}`;
  }

  private parseUserId(value: unknown): number | null {
    const raw = Array.isArray(value) ? value[0] : value;
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  private parseRole(value: unknown): string | undefined {
    const raw = Array.isArray(value) ? value[0] : value;
    const role = raw?.toString().trim();
    return role || undefined;
  }
}
