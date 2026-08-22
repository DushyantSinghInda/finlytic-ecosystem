import {
	CreateBucketCommand,
	GetObjectCommand,
	HeadBucketCommand,
	PutObjectCommand,
	S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ObjectStorageService implements OnModuleInit {
	private readonly logger = new Logger(ObjectStorageService.name);
	private readonly client: S3Client;
	private readonly bucket: string;

	constructor(configService: ConfigService) {
		this.bucket = configService.get<string>('S3_BUCKET')!;

		this.client = new S3Client({
			endpoint: configService.get<string>('S3_ENDPOINT'),
			region: configService.get<string>('S3_REGION')!,
			forcePathStyle: true,
			credentials: {
				accessKeyId: configService.get<string>('S3_ACCESS_KEY_ID')!,
				secretAccessKey: configService.get<string>('S3_SECRET_ACCESS_KEY')!,
			},
		});
	}

	async onModuleInit(): Promise<void> {
		try {
			await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
		} catch {
			await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
			this.logger.log(`Created bucket ${this.bucket}`);
		}

		this.logger.log(`Object storage ready (bucket: ${this.bucket})`);
	}

	buildRawKey(
		accountId: string,
		sentAt: Date,
		providerMessageId: string,
	): string {
		const year = sentAt.getUTCFullYear();
		const month = String(sentAt.getUTCMonth() + 1).padStart(2, '0');

		return `raw/${accountId}/${year}/${month}/${providerMessageId}.eml`;
	}

	buildBodyKey(
		accountId: string,
		sentAt: Date,
		providerMessageId: string,
	): string {
		const year = sentAt.getUTCFullYear();
		const month = String(sentAt.getUTCMonth() + 1).padStart(2, '0');

		return `text/${accountId}/${year}/${month}/${providerMessageId}.txt`;
	}

	async put(key: string, body: Buffer, contentType: string): Promise<string> {
		await this.client.send(
			new PutObjectCommand({
				Bucket: this.bucket,
				Key: key,
				Body: body,
				ContentType: contentType,
			}),
		);

		return key;
	}

	async get(key: string): Promise<Buffer> {
		const result = await this.client.send(
			new GetObjectCommand({ Bucket: this.bucket, Key: key }),
		);

		return Buffer.from(await result.Body!.transformToByteArray());
	}

	async isReachable(): Promise<boolean> {
		try {
			await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
			return true;
		} catch {
			return false;
		}
	}
}
