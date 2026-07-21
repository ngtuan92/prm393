import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Pool } from 'pg';
import { POSTGRES_POOL } from './database.constants';
import { databaseConfig, typeOrmConfig } from '../config/database.config';

@Global()
@Module({
  imports: [TypeOrmModule.forRootAsync({ useFactory: typeOrmConfig })],
  providers: [
    {
      provide: POSTGRES_POOL,
      useFactory: () => new Pool(databaseConfig()),
    },
  ],
  exports: [POSTGRES_POOL, TypeOrmModule],
})
export class DatabaseModule {}
