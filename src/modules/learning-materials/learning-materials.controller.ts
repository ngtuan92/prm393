import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CreateLearningMaterialRequest } from '../../models/requests/create-learning-material.request';
import { LearningMaterialsService } from './learning-materials.service';

@ApiTags('learning-materials')
@Controller('learning-materials')
export class LearningMaterialsController {
  constructor(private readonly learningMaterialsService: LearningMaterialsService) {}

  @Get('teacher')
  @ApiOperation({ summary: 'Get learning materials created by a teacher' })
  getTeacherMaterials(
    @Query('userId', ParseIntPipe) userId: number,
    @Query('className') className?: string,
    @Query('subjectName') subjectName?: string,
    @Query('semester') semester?: string,
  ) {
    return this.learningMaterialsService.findForTeacher(
      userId,
      className,
      subjectName,
      semester,
    );
  }

  @Post('teacher')
  @ApiOperation({ summary: 'Create a learning material for a class and subject' })
  createTeacherMaterial(@Body() body: CreateLearningMaterialRequest) {
    return this.learningMaterialsService.createForTeacher(body);
  }

  @Post('teacher/upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a learning material file' })
  uploadTeacherMaterial(@UploadedFile() file: any) {
    return this.learningMaterialsService.saveUploadedFile(file);
  }

  @Get('files/:fileName')
  @ApiOperation({ summary: 'Download a learning material file' })
  downloadMaterialFile(@Param('fileName') fileName: string, @Res() res: Response) {
    const filePath = this.learningMaterialsService.getUploadedFilePath(fileName);
    return res.download(filePath);
  }

  @Get('student')
  @ApiOperation({ summary: 'Get learning materials available to a student' })
  getStudentMaterials(
    @Query('studentId') studentId: string,
    @Query('subjectName') subjectName?: string,
    @Query('semester') semester?: string,
  ) {
    return this.learningMaterialsService.findForStudent(
      studentId || 'HS100001',
      subjectName,
      semester,
    );
  }

  @Get('parent')
  @ApiOperation({ summary: 'Get learning materials for a parent linked student' })
  getParentMaterials(
    @Query('parentUserId', ParseIntPipe) parentUserId: number,
    @Query('studentId') studentId?: string,
    @Query('subjectName') subjectName?: string,
    @Query('semester') semester?: string,
  ) {
    return this.learningMaterialsService.findForParent(
      parentUserId,
      studentId,
      subjectName,
      semester,
    );
  }
}
