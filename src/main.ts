require('./polyfill-web-crypto');
import mongoose from 'mongoose';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { join } from 'path';
import authMiddleware from './common/middleware/auth.middleware';
import adminAuthMiddleware from './common/middleware/admin-auth.middleware';
import fasahRoutes from './routes/fasahRoutes';
import zatcaCompatRoutes from './routes/zatcaCompatRoutes';
import zatcaCompatRoutesV1 from './routes/zatcaCompatRoutesV1';
import zatcaTasV2Routes from './routes/zatcaTasV2Routes';
import zatcaTasCustomsRoutes from './routes/zatcaTasCustomsRoutes';
import zatcaFleetV1Routes from './routes/zatcaFleetV1Routes';
import zatcaFleetCompatRoutes from './routes/zatcaFleetCompatRoutes';
import authRoutes from './routes/authRoutes';
import queueAppointmentRoutes from './routes/queueAppointmentRoutes';
import Schedule from './schemas/schedule.schema';
import loggerService from './services/logger.service';
import * as dailyBookingResetCron from './services/dailyBookingResetCron';
import { startAppointmentWatcherCron } from './services/appointmentWatcherCron';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const port = config.get<number>('PORT') || 3001;
  const mongoUri = config.get<string>('MONGO_URI') || 'mongodb://127.0.0.1:27017/fasah';

  const corsOriginRaw = config.get<string>('CORS_ORIGIN');
  const corsOrigins =
    !corsOriginRaw || corsOriginRaw.trim() === '*'
      ? true
      : corsOriginRaw.split(',').map((o) => o.trim()).filter(Boolean);
  const corsCredentials = String(config.get('CORS_CREDENTIALS') ?? 'true').toLowerCase() === 'true';

  app.enableCors({
    origin: corsOrigins,
    credentials: corsCredentials,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Auth-Token',
      'x-auth-token',
      'token',
      'X-Requested-With',
      'Accept',
      'Origin',
      'g-recaptcha-response'
    ],
    exposedHeaders: ['Content-Length', 'Content-Type'],
    maxAge: 86400
  });

  // Services/schemas use mongoose.model() on the default connection (not Nest createConnection).
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
  console.log(`MongoDB connected (${mongoose.connection.name})`);

  app.useBodyParser('json');
  app.useBodyParser('urlencoded', { extended: true });

  const publicPath = join(__dirname, '..', 'public');
  app.useStaticAssets(publicPath);

  const expressApp = app.getHttpAdapter().getInstance();

  function sendLoginPage(_req: unknown, res: { setHeader: (k: string, v: string) => void; sendFile: (p: string) => void }) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.sendFile(join(publicPath, 'login.html'));
  }
  expressApp.get('/login', sendLoginPage);
  expressApp.get('/login.html', sendLoginPage);
  function sendUsersPage(_req: unknown, res: { setHeader: (k: string, v: string) => void; sendFile: (p: string) => void }) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.sendFile(join(publicPath, 'users.html'));
  }
  expressApp.get('/users', sendUsersPage);
  expressApp.get('/users.html', sendUsersPage);

  expressApp.get('/health', (_req: unknown, res: { json: (b: unknown) => void }) => {
    res.json({ status: 'ok', service: 'FASAH Proxy', timestamp: new Date().toISOString() });
  });

  expressApp.get('/schedule', async (_req: unknown, res: { json: (b: unknown) => void }) => {
    const schedule = await Schedule.find();
    res.json(schedule);
  });

  expressApp.get('/loggers', async (_req: unknown, res: { json: (b: unknown) => void }) => {
    res.json(await loggerService.getLoggers());
  });

  expressApp.delete('/loggers', adminAuthMiddleware, async (_req: unknown, res: { json: (b: unknown) => void; status: (n: number) => { json: (b: unknown) => void } }) => {
    try {
      const result = await loggerService.deleteAllLoggers();
      res.json({ success: true, message: 'All logger history deleted', deletedCount: result.deletedCount });
    } catch (err: unknown) {
      res.status(500).json({ success: false, message: (err as Error).message || 'Failed to delete logger history' });
    }
  });

  expressApp.use('/api/fasah', authMiddleware, fasahRoutes);
  expressApp.use('/api/zatca', authMiddleware, zatcaCompatRoutes);
  expressApp.use('/api/zatca-tas/v1', authMiddleware, zatcaCompatRoutesV1);
  expressApp.use('/api/zatca-tas/v2', authMiddleware, zatcaTasV2Routes);
  expressApp.use('/api/zatca-tas/customs', authMiddleware, zatcaTasCustomsRoutes);
  expressApp.use('/api/zatca-fleet/v1', authMiddleware, zatcaFleetV1Routes);
  expressApp.use('/api/zatca-fleet/v2', authMiddleware, zatcaFleetCompatRoutes);
  expressApp.use('/api/auth', authRoutes);
  expressApp.use('/api/queue-appointments', authMiddleware, queueAppointmentRoutes);

  expressApp.use((_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) => {
    res.status(404).json({ success: false, message: 'Endpoint not found' });
  });

  await app.listen(port, '0.0.0.0');
  console.log(`🚀 FASAH Proxy Server (NestJS) running on port ${port}`);
  console.log(`📡 API Base URL: http://localhost:${port}/api/fasah`);
  console.log(`❤️  Health Check: http://localhost:${port}/health`);

  dailyBookingResetCron.start();
  const watcherEnabledAtBoot =
    String(config.get('WATCHER_ENABLED') ?? 'false').toLowerCase() === 'true';
  if (watcherEnabledAtBoot) {
    startAppointmentWatcherCron();
  } else {
    console.log(
      '[watcher] WATCHER_ENABLED=false — not started at boot (use POST /api/queue-appointments/watcher/start or set env true)'
    );
  }
}

bootstrap();
