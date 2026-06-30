export interface Config {
  port: number;
  databaseUrl: string;
  redisUrl: string | null;
  jwtSecret: string;
  jwtExpiresIn: string;
  storageDriver: 's3' | 'memory';
  s3: {
    bucket: string;
    region: string;
    endpoint: string | null;
    forcePathStyle: boolean;
    publicBaseUrl: string | null;
  };
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

/**
 * Build the typed config from process.env. Call hydrateEnvFromSsm() first if you
 * want SSM-backed secrets to be available here.
 */
export function loadConfig(): Config {
  const storageDriver =
    (process.env.STORAGE_DRIVER as 's3' | 'memory' | undefined) ??
    (process.env.S3_BUCKET ? 's3' : 'memory');

  if (storageDriver === 's3' && !process.env.S3_BUCKET) {
    throw new Error('STORAGE_DRIVER=s3 requires S3_BUCKET to be set');
  }

  return {
    port: Number(process.env.PORT ?? 8080),
    databaseUrl: required('DATABASE_URL'),
    redisUrl: process.env.REDIS_URL ?? null,
    jwtSecret: required('JWT_SECRET'),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
    storageDriver,
    s3: {
      bucket: process.env.S3_BUCKET ?? '',
      region: process.env.AWS_REGION ?? 'eu-central-1',
      endpoint: process.env.S3_ENDPOINT ?? null,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      publicBaseUrl: process.env.S3_PUBLIC_BASE_URL ?? null,
    },
  };
}
