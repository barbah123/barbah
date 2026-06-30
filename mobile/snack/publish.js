// Saves/updates the @barbah/pokemon-auction Snack with the local App.js contents.
// Usage: EXPO_TOKEN=<token> node mobile/snack/publish.js
//
// The current App.js is embedded inline, so after each run the saved Snack is
// exactly the committed code (run this after every change to refresh it).
//
// Deps: npm i snack-sdk undici   (undici only needed behind an HTTPS proxy)

const fs = require('fs');
const path = require('path');

const APP_JS = fs.readFileSync(path.join(__dirname, 'App.js'), 'utf8');

// Route Node's fetch through an HTTPS proxy when one is configured (CI sandboxes).
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
if (proxy) {
  try {
    const { ProxyAgent, setGlobalDispatcher } = require('undici');
    setGlobalDispatcher(new ProxyAgent(proxy));
  } catch {
    /* undici not installed / not needed on a normal machine */
  }
}

const { Snack } = require('snack-sdk');

(async () => {
  const token = process.env.EXPO_TOKEN || process.env.expo_access_tokens;
  if (!token) {
    console.error('Set EXPO_TOKEN (expo.dev → Account Settings → Access Tokens).');
    process.exit(2);
  }

  const snack = new Snack({
    online: false,
    name: 'Pokemon Auction',
    description: 'Pokemon kart acik artirma - canli backend',
    sdkVersion: '54.0.0',
    files: { 'App.js': { type: 'CODE', contents: APP_JS } },
    user: { accessToken: token },
  });

  const saved = await snack.saveAsync();
  console.log('Saved: https://snack.expo.dev/' + saved.id);
})().catch((e) => {
  console.error('Save failed:', e && e.message ? e.message : e);
  process.exit(1);
});
