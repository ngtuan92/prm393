import { Module } from '@nestjs/common';
import { StaffsController } from './staffs.controller';
import { StaffsService } from './staffs.service';

@Module({
  controllers: [StaffsController],
  providers: [StaffsService],
})
export class StaffsModule {}
