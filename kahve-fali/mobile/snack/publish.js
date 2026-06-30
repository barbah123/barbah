// @barbah/kahve-fali Snack'ini yerel App.js içeriğiyle kaydeder/günceller.
// Kullanım: EXPO_TOKEN=<token> node kahve-fali/mobile/snack/publish.js
//
// App.js gömülü olarak gönderilir; her çalıştırmada kayıtlı Snack commit'lenmiş
// kodun aynısı olur (kod değişince yeniden çalıştırın).
//
// Bağımlılıklar: npm i snack-sdk undici   (undici yalnızca HTTPS proxy arkasında gerekir)

const fs = require('fs');
const path = require('path');

const APP_JS = fs.readFileSync(path.join(__dirname, 'App.js'), 'utf8');

// CI sandbox'larında Node fetch'ini HTTPS proxy üzerinden yönlendir.
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
if (proxy) {
  try {
    const { ProxyAgent, setGlobalDispatcher } = require('undici');
    setGlobalDispatcher(new ProxyAgent(proxy));
  } catch {
    /* normal makinede gerekmez */
  }
}

const { Snack } = require('snack-sdk');

(async () => {
  const token = process.env.EXPO_TOKEN || process.env.expo_access_tokens;
  if (!token) {
    console.error('EXPO_TOKEN ayarlayın (expo.dev → Account Settings → Access Tokens).');
    process.exit(2);
  }

  const snack = new Snack({
    online: false,
    name: 'Kahve Fali',
    description: 'Yapay zeka destekli kahve falı - canli backend',
    sdkVersion: '54.0.0',
    files: { 'App.js': { type: 'CODE', contents: APP_JS } },
    dependencies: { 'expo-image-picker': { version: '17.0.11' } },
    user: { accessToken: token },
  });

  const saved = await snack.saveAsync();
  console.log('Saved: https://snack.expo.dev/' + saved.id);
})().catch((e) => {
  console.error('Save failed:', e && e.message ? e.message : e);
  process.exit(1);
});
