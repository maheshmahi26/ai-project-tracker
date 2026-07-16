import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppConfigModule, AppConfigService } from '../../config/config.module';

/**
 * MongoDB connection (Mongoose). The URI points at a single-node replica set so
 * multi-document transactions work in dev exactly as in prod.
 * See specs/03-database-schema.md.
 */
@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        uri: config.get('MONGODB_URI'),
        autoIndex: !config.isProduction,
      }),
    }),
  ],
})
export class DatabaseModule {}
