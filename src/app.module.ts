import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { SignOptions } from 'jsonwebtoken';
import { DatabaseModule } from './database/database.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClubsModule } from './modules/clubs/clubs.module';
import { HealthModule } from './modules/health/health.module';
import { LearningMaterialsModule } from './modules/learning-materials/learning-materials.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { StudentsModule } from './modules/students/students.module';
import { StaffsModule } from './modules/staffs/staffs.module';
import { SupervisorsModule } from './modules/supervisors/supervisors.module';
import { TeachersModule } from './modules/teachers/teachers.module';

const jwtExpiresIn = (process.env.JWT_EXPIRES_IN ||
  '7d') as SignOptions['expiresIn'];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'fptu-portal-secret',
      signOptions: {
        expiresIn: jwtExpiresIn,
      },
    }),
    HealthModule,
    AuthModule,
    ClubsModule,
    ApplicationsModule,
    LearningMaterialsModule,
    NotificationsModule,
    StudentsModule,
    StaffsModule,
    TeachersModule,
    SupervisorsModule,
  ],
})
export class AppModule {}
