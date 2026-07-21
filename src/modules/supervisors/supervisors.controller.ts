import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SupervisorsService } from './supervisors.service';

@ApiTags('supervisors')
@Controller('supervisors')
export class SupervisorsController {
  constructor(private readonly supervisorsService: SupervisorsService) {}

  @Get('classes')
  @ApiOperation({ summary: 'Get all classes' })
  getClasses() {
    return this.supervisorsService.findClasses();
  }

  @Get('classes/students')
  @ApiOperation({ summary: 'Get students by class' })
  getStudentsByClass(@Query('className') className: string) {
    return this.supervisorsService.findStudentsByClass(className);
  }

  @Get('attendance')
  @ApiOperation({ summary: 'Get classroom attendance' })
  getAttendance(
    @Query('className') className: string,
    @Query('date') date: string,
  ) {
    return this.supervisorsService.findAttendance(className, date);
  }

  @Post('attendance/save')
  @ApiOperation({ summary: 'Save classroom attendance' })
  saveAttendance(
    @Query('className') className: string,
    @Query('date') date: string,
    @Body() body: { attendanceList: any[] },
  ) {
    return this.supervisorsService.saveAttendance(className, date, body.attendanceList);
  }

  @Get('discipline')
  @ApiOperation({ summary: 'Get discipline logs' })
  getDisciplineLogs(
    @Query('className') className?: string,
    @Query('studentId') studentId?: string,
  ) {
    return this.supervisorsService.findDisciplineLogs(className, studentId);
  }

  @Post('discipline/log')
  @ApiOperation({ summary: 'Log a discipline violation' })
  logDiscipline(
    @Body()
    body: {
      studentId: string;
      className: string;
      violationType: string;
      description: string;
      imageUrl?: string;
      loggedBy?: string;
    },
  ) {
    return this.supervisorsService.logDiscipline(
      body.studentId,
      body.className,
      body.violationType,
      body.description,
      body.imageUrl || null,
      body.loggedBy || 'Giám thị',
    );
  }
}
