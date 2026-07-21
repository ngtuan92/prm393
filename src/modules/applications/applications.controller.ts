import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { CreateApplicationRequest } from '../../models/requests/create-application.request';
import { ApplicationsService } from './applications.service';

@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Get()
  getApplications(@Query('userId') userId?: string) {
    if (userId) {
      return this.applicationsService.findByUser(Number(userId));
    }
    return this.applicationsService.findAll();
  }

  @Post()
  create(@Body() payload: CreateApplicationRequest) {
    return this.applicationsService.create(payload);
  }

  @Put(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
    return this.applicationsService.updateStatus(Number(id), status);
  }
}
