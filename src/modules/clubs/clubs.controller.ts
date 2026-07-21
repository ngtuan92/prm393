import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { CreateClubRegistrationRequest } from '../../models/requests/create-club-registration.request';
import { ClubsService } from './clubs.service';

@Controller('clubs')
export class ClubsController {
  constructor(private readonly clubsService: ClubsService) {}

  @Get()
  findAll(
    @Query('userId') userId?: string,
    @Query('studentCode') studentCode?: string,
  ) {
    return this.clubsService.findAll(
      userId ? Number(userId) : undefined,
      studentCode,
    );
  }

  @Get('registrations')
  findRegistrations(@Query('status') status?: string) {
    return this.clubsService.findRegistrations(status);
  }

  @Post('registrations')
  register(@Body() payload: CreateClubRegistrationRequest) {
    return this.clubsService.register(payload);
  }

  @Put('registrations/:id/status')
  updateRegistrationStatus(
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
    return this.clubsService.updateRegistrationStatus(Number(id), status);
  }
}
