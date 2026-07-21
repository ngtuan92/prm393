import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import * as express from 'express';
import { StaffsService } from './staffs.service';

@ApiTags('staffs')
@Controller('staffs')
export class StaffsController {
  constructor(private readonly staffsService: StaffsService) {}

  @Get('classes')
  @ApiOperation({ summary: 'Get managed class list' })
  getClasses() {
    return this.staffsService.findClasses();
  }

  @Get('classes/students')
  @ApiOperation({ summary: 'Get students in a class' })
  getStudentsByClass(@Query('className') className: string) {
    return this.staffsService.findStudentsByClass(className);
  }

  @Get('classes/students/export')
  @ApiOperation({ summary: 'Export a class roster to Excel' })
  async exportClassRoster(
    @Query('className') className: string,
    @Res() res: express.Response,
  ) {
    const buffer = await this.staffsService.exportClassRoster(className);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=danh_sach_lop_${className}.xlsx`,
    );
    res.end(buffer);
  }

  @Get('classes/students/template')
  @ApiOperation({
    summary: 'Download an Excel template for class roster import',
  })
  async exportClassRosterTemplate(
    @Query('className') className: string,
    @Res() res: express.Response,
  ) {
    const buffer =
      await this.staffsService.exportClassRosterTemplate(className);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=mau_danh_sach_lop_${className}.xlsx`,
    );
    res.end(buffer);
  }

  @Post('classes/students/import')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Import students into a class from Excel' })
  importClassRoster(
    @Query('className') className: string,
    @UploadedFile() file: any,
  ) {
    return this.staffsService.importClassRoster(file?.buffer, className);
  }

  @Get('students/available')
  @ApiOperation({ summary: 'Get students that can be added to a class' })
  getAvailableStudents(@Query('className') className: string) {
    return this.staffsService.findAvailableStudents(className);
  }

  @Post('classes/students')
  @ApiOperation({ summary: 'Add a student to a class roster' })
  addStudentToClass(
    @Body()
    body: {
      className: string;
      studentId: string;
      subjectName?: string;
    },
  ) {
    return this.staffsService.addStudentToClass(
      body.className,
      body.studentId,
      body.subjectName,
    );
  }

  @Delete('classes/:className/students/:studentId')
  @ApiOperation({ summary: 'Remove a student from a class roster' })
  removeStudentFromClass(
    @Param('className') className: string,
    @Param('studentId') studentId: string,
  ) {
    return this.staffsService.removeStudentFromClass(className, studentId);
  }

  @Get('teachers')
  @ApiOperation({ summary: 'Get teachers for homeroom assignment' })
  getTeachers() {
    return this.staffsService.findTeachers();
  }

  @Post('classes/homeroom-teacher')
  @ApiOperation({ summary: 'Assign a homeroom teacher to a class' })
  assignHomeroomTeacher(
    @Body() body: { className: string; teacherId: number },
  ) {
    return this.staffsService.assignHomeroomTeacher(
      body.className,
      Number(body.teacherId),
    );
  }

  @Get('schedules')
  @ApiOperation({ summary: 'Get teaching schedules managed by staff' })
  getSchedules(@Query('className') className?: string) {
    return this.staffsService.findSchedules(className);
  }

  @Post('schedules')
  @ApiOperation({ summary: 'Create a teaching and study schedule' })
  createSchedule(
    @Body()
    body: {
      className: string;
      teacherId: number;
      subjectName: string;
      semester: string;
      studyDate: string;
      dayOfWeek: string;
      slotName: string;
      startTime: string;
      endTime: string;
      room: string;
    },
  ) {
    return this.staffsService.createSchedule({
      ...body,
      teacherId: Number(body.teacherId),
    });
  }

  @Get('teacher-applications')
  @ApiOperation({ summary: 'Get applications sent by teachers' })
  getTeacherApplications() {
    return this.staffsService.findTeacherApplications();
  }
}
