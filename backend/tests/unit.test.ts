import { describe, expect, it } from 'vitest';
import { signJwt, verifyJwt } from '../src/lib/jwt.js';
import { hashPassword, verifyPassword } from '../src/lib/password.js';
import { hydrateEnvFromSsm } from '../src/ssm.js';

describe('jwt', () => {
  it('signs and verifies a round-trip', () => {
    const user = { id: '1', email: 'a@b.com', username: 'ash' };
    const token = signJwt(user, 'secret', '1h');
    expect(verifyJwt(token, 'secret')).toMatchObject(user);
  });

  it('rejects a token signed with a different secret', () => {
    const token = signJwt({ id: '1', email: 'a@b.com', username: 'ash' }, 'secret', '1h');
    expect(() => verifyJwt(token, 'other')).toThrow();
  });
});

describe('password hashing', () => {
  it('hashes and verifies', async () => {
    const hash = await hashPassword('hunter2');
    expect(hash).not.toBe('hunter2');
    expect(await verifyPassword('hunter2', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});

describe('ssm hydration', () => {
  it('is a no-op when USE_SSM is not set', async () => {
    delete process.env.USE_SSM;
    await expect(hydrateEnvFromSsm()).resolves.toBeUndefined();
  });

  it('throws when USE_SSM=true but SSM_PATH is missing', async () => {
    process.env.USE_SSM = 'true';
    delete process.env.SSM_PATH;
    await expect(hydrateEnvFromSsm()).rejects.toThrow(/SSM_PATH/);
    delete process.env.USE_SSM;
  });
});
