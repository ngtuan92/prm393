import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { LearningMaterialsController } from './learning-materials.controller';
import { LearningMaterialsService } from './learning-materials.service';

@Module({
  imports: [NotificationsModule],
  controllers: [LearningMaterialsController],
  providers: [LearningMaterialsService],
})
export class LearningMaterialsModule {}
