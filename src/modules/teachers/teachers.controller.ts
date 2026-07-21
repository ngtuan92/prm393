import { Controller, Get, Post, Query, Body, ParseIntPipe, UseInterceptors, UploadedFile, Res } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TeachersService } from './teachers.service';
import { FileInterceptor } from '@nestjs/platform-express';
import * as express from 'express';

@ApiTags('teachers')
@Controller('teachers')
export class TeachersController {
  constructor(private readonly teachersService: TeachersService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get teacher profile and business capabilities' })
  getProfile(@Query('userId', ParseIntPipe) userId: number) {
    return this.teachersService.findProfile(userId);
  }

  @Get('classes')
  @ApiOperation({ summary: 'Get classes assigned to a teacher' })
  getClasses(@Query('userId', ParseIntPipe) userId: number) {
    return this.teachersService.findClasses(userId);
  }

  @Get('homeroom/students')
  @ApiOperation({ summary: 'Get students in teacher homeroom class' })
  getHomeroomStudents(@Query('userId', ParseIntPipe) userId: number) {
    return this.teachersService.findHomeroomStudents(userId);
  }

  @Get('homeroom/attendance')
  @ApiOperation({ summary: 'Get attendance in teacher homeroom class' })
  getHomeroomAttendance(
    @Query('userId', ParseIntPipe) userId: number,
    @Query('date') date: string,
  ) {
    return this.teachersService.findHomeroomAttendance(userId, date);
  }

  @Get('schedule')
  @ApiOperation({ summary: 'Get schedule for a teacher' })
  getSchedule(@Query('userId', ParseIntPipe) userId: number) {
    return this.teachersService.findSchedule(userId);
  }

  @Get('grades')
  @ApiOperation({ summary: 'Get grades for class, subject, and semester' })
  getGrades(
    @Query('className') className: string,
    @Query('subject') subject: string,
    @Query('semester') semester: string,
  ) {
    return this.teachersService.findClassGrades(className, subject, semester);
  }

  @Post('grades/save')
  @ApiOperation({ summary: 'Save grades for class, subject, and semester' })
  async saveGrades(
    @Query('className') className: string,
    @Query('subject') subject: string,
    @Query('semester') semester: string,
    @Body() body: { gradesList: any[] },
  ) {
    await this.teachersService.saveClassGrades(
      className,
      subject,
      semester,
      body.gradesList,
    );
    return { success: true };
  }

  @Get('grades/template')
  @ApiOperation({ summary: 'Download grade entry Excel template' })
  async downloadTemplate(
    @Query('className') className: string,
    @Query('subject') subject: string,
    @Query('semester') semester: string,
    @Res() res: express.Response,
  ) {
    const buffer = await this.teachersService.generateExcelTemplate(
      className,
      subject,
      semester,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=nhap_diem_mau_${className}.xlsx`,
    );
    res.end(buffer);
  }

  @Post('grades/import')
  @ApiOperation({ summary: 'Import grades from Excel' })
  @UseInterceptors(FileInterceptor('file'))
  async importGrades(
    @Query('className') className: string,
    @Query('subject') subject: string,
    @Query('semester') semester: string,
    @UploadedFile() file: any,
  ) {
    return this.teachersService.importExcelGrades(
      file.buffer,
      className,
      subject,
      semester,
    );
  }

  @Get('grades/export')
  @ApiOperation({ summary: 'Export grades to Excel' })
  async exportGrades(
    @Query('className') className: string,
    @Query('subject') subject: string,
    @Query('semester') semester: string,
    @Res() res: express.Response,
  ) {
    const buffer = await this.teachersService.exportExcelGrades(
      className,
      subject,
      semester,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=bang_diem_${className}.xlsx`,
    );
    res.end(buffer);
  }

  @Get('exam-schedule')
  @ApiOperation({ summary: 'Get exam schedules created by teacher' })
  getExamSchedule(@Query('userId', ParseIntPipe) userId: number) {
    return this.teachersService.findExamSchedule(userId);
  }

  @Post('exam-schedule')
  @ApiOperation({ summary: 'Create a new exam schedule and notify students' })
  createExamSchedule(
    @Body()
    body: {
      className: string;
      subjectName: string;
      examDate: string;
      slotName: string;
      room: string;
      semester: string;
      userId: number;
    },
  ) {
    return this.teachersService.createExamSchedule(body);
  }
}
