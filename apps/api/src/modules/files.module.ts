import {
  BadRequestException,
  Controller, Get, Injectable, Logger, Module, NotFoundException,
  Param, Post, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { AuthOnly } from '../common/decorators';

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const logger = new Logger('Files');

/**
 * File storage backed by S3-compatible MinIO; falls back to local disk when
 * MinIO is unreachable (keeps `npm run dev` working without docker).
 */
@Injectable()
export class FilesService {
  private minio: import('minio').Client | null = null;
  private bucket = process.env.S3_BUCKET || 'edum';
  private localDir = path.join(process.cwd(), 'uploads');
  private minioReady = false;

  constructor() {
    void this.init();
  }

  private async init() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Client } = require('minio');
      const url = new URL(process.env.S3_ENDPOINT || 'http://localhost:9000');
      const client: import('minio').Client = new Client({
        endPoint: url.hostname,
        port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
        useSSL: url.protocol === 'https:',
        accessKey: process.env.S3_ACCESS_KEY || 'minioadmin',
        secretKey: process.env.S3_SECRET_KEY || 'minioadmin',
      });
      const exists = await client.bucketExists(this.bucket);
      if (!exists) await client.makeBucket(this.bucket, 'us-east-1');
      this.minio = client;
      this.minioReady = true;
      logger.log(`MinIO storage ready (bucket=${this.bucket})`);
    } catch (e) {
      this.minioReady = false;
      fs.mkdirSync(this.localDir, { recursive: true });
      logger.warn(`MinIO unavailable (${(e as Error).message}) — using local disk fallback at ./uploads`);
    }
  }

  async save(file: { originalname: string; buffer: Buffer; mimetype: string; size: number }): Promise<{ fileKey: string; name: string; size: number }> {
    if (file.size > MAX_SIZE) throw new BadRequestException('File exceeds 10 MB limit');
    const safeName = file.originalname.replace(/[^\w.\-]/g, '_').slice(0, 100);
    const fileKey = `${Date.now()}-${randomBytes(6).toString('hex')}-${safeName}`;
    if (this.minioReady && this.minio) {
      await this.minio.putObject(this.bucket, fileKey, file.buffer, file.size, { 'Content-Type': file.mimetype });
    } else {
      fs.mkdirSync(this.localDir, { recursive: true });
      fs.writeFileSync(path.join(this.localDir, fileKey), file.buffer);
    }
    return { fileKey, name: safeName, size: file.size };
  }

  async stream(fileKey: string, res: Response) {
    if (fileKey.includes('..') || fileKey.includes('/')) throw new BadRequestException('Invalid key');
    if (this.minioReady && this.minio) {
      try {
        const stat = await this.minio.statObject(this.bucket, fileKey);
        res.setHeader('Content-Type', (stat.metaData?.['content-type'] as string) || 'application/octet-stream');
        const stream = await this.minio.getObject(this.bucket, fileKey);
        stream.pipe(res);
        return;
      } catch {
        throw new NotFoundException('File not found');
      }
    }
    const p = path.join(this.localDir, fileKey);
    if (!fs.existsSync(p)) throw new NotFoundException('File not found');
    res.sendFile(p);
  }
}

@Controller('files')
export class FilesController {
  constructor(private readonly svc: FilesService) {}

  // Any authenticated user may upload (attachments, homework files, documents).
  @Post('upload')
  @AuthOnly()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_SIZE } }))
  upload(@UploadedFile() file?: { originalname: string; buffer: Buffer; mimetype: string; size: number }) {
    if (!file) throw new BadRequestException('No file provided (field name: file)');
    return this.svc.save(file);
  }

  @Get(':fileKey')
  @AuthOnly()
  stream(@Param('fileKey') fileKey: string, @Res() res: Response) {
    return this.svc.stream(fileKey, res);
  }
}

@Module({ controllers: [FilesController], providers: [FilesService] })
export class FilesModule {}
