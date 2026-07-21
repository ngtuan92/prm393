import { Body, Controller, Get, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateNotificationRequest } from '../../models/requests/create-notification.request';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get notifications for a user and role' })
  findForUser(
    @Query('userId', ParseIntPipe) userId: number,
    @Query('role') role: string,
  ): Promise<unknown[]> {
    return this.notificationsService.findForUser(userId, role || 'Student');
  }

  @Post()
  @ApiOperation({ summary: 'Create and emit a realtime notification' })
  create(@Body() payload: CreateNotificationRequest): Promise<unknown> {
    return this.notificationsService.create(payload);
  }
}
