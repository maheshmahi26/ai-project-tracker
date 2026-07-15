import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { AppController } from './app.controller';

@Module({
  imports: [AppConfigModule],
  controllers: [AppController],
})
export class AppModule {}
