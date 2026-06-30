import { SSMClient, GetParametersByPathCommand } from '@aws-sdk/client-ssm';

/**
 * Load every parameter under an SSM path (e.g. "/pokemon-auction/prod/") and
 * return them as a flat KEY -> value map. The trailing segment of each
 * parameter name becomes the env var key, upper-cased.
 *
 *   /pokemon-auction/prod/DATABASE_URL  ->  DATABASE_URL
 *   /pokemon-auction/prod/jwt_secret    ->  JWT_SECRET
 *
 * SecureString parameters are returned decrypted (WithDecryption: true), so the
 * IAM role/instance the app runs on must have ssm:GetParametersByPath and KMS
 * decrypt permission for the relevant key.
 */
export async function loadParamsFromSsm(
  path: string,
  region = process.env.AWS_REGION ?? 'eu-central-1',
): Promise<Record<string, string>> {
  const client = new SSMClient({ region });
  const prefix = path.endsWith('/') ? path : `${path}/`;
  const result: Record<string, string> = {};
  let nextToken: string | undefined;

  do {
    const res = await client.send(
      new GetParametersByPathCommand({
        Path: prefix,
        Recursive: true,
        WithDecryption: true,
        NextToken: nextToken,
      }),
    );
    for (const p of res.Parameters ?? []) {
      if (!p.Name || p.Value === undefined) continue;
      const leaf = p.Name.slice(p.Name.lastIndexOf('/') + 1);
      result[leaf.toUpperCase()] = p.Value;
    }
    nextToken = res.NextToken;
  } while (nextToken);

  return result;
}

/**
 * Pull secrets from SSM into process.env. Existing env vars win, so a developer
 * can override any value locally without touching SSM. Controlled by USE_SSM
 * and SSM_PATH; a no-op when USE_SSM !== "true".
 */
export async function hydrateEnvFromSsm(): Promise<void> {
  if (process.env.USE_SSM !== 'true') return;
  const path = process.env.SSM_PATH;
  if (!path) {
    throw new Error('USE_SSM=true but SSM_PATH is not set');
  }
  const params = await loadParamsFromSsm(path);
  for (const [key, value] of Object.entries(params)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
