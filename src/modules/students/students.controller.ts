import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { StudentsService } from './students.service';

@ApiTags('students')
@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get('grades')
  @ApiOperation({ summary: 'Get grades for a student' })
  getGrades(@Query('studentId') studentId: string) {
    return this.studentsService.findGrades(studentId || 'HS100001');
  }

  @Get('schedule')
  @ApiOperation({ summary: 'Get schedule and attendance for a student' })
  getSchedule(@Query('studentId') studentId: string) {
    return this.studentsService.findSchedule(studentId || 'HS100001');
  }

  @Get('tuition')
  @ApiOperation({ summary: 'Get tuition payments for a student' })
  getTuition(@Query('studentId') studentId: string) {
    return this.studentsService.findTuition(studentId || 'HS100001');
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get student profile' })
  getProfile(@Query('studentId') studentId: string) {
    return this.studentsService.findProfile(studentId || 'HS100001');
  }

  @Get('exam-schedule')
  @ApiOperation({ summary: 'Get exam schedule for a student' })
  getExamSchedule(@Query('studentId') studentId: string) {
    return this.studentsService.findExamSchedule(studentId || 'HS100001');
  }

  @Get('homeroom-teacher')
  @ApiOperation({ summary: 'Get homeroom teacher for a student' })
  getHomeroomTeacher(@Query('studentId') studentId: string) {
    return this.studentsService.findHomeroomTeacher(studentId || 'HS100001');
  }
}
