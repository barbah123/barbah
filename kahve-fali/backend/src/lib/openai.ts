// OpenAI Chat Completions ile kahve falı üretimi (metin ve görsel/vision destekli).

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODELS_URL = 'https://api.openai.com/v1/models';

const SYSTEM_PROMPT = `Sen deneyimli, sıcak ve mistik bir Türk kahve falcısısın.
Kullanıcı sana bir fincan/tabak fotoğrafı ve/veya bir niyet (soru) iletir.
ÖNCELİĞİN kahve telvesidir: fotoğraf varsa telvedeki şekilleri (kuş, yol, yılan, kalp, göz, dağ,
balık, gemi, yüzük vb.) tek tek oku ve yorumla. Fal ağırlıklı olarak bu telve okumasına dayansın.
Kullanıcının yazdığı NİYETİ/soruyu ve verdiyse KİŞİSEL BİLGİLERİNİ (burç, cinsiyet, medeni durum)
dikkatle dikkate al; falı doğrudan bunlara göre kişiselleştir ve özellikle niyetiyle ilgili konuya eğil.
Akıcı, samimi, umut veren ve detaylı bir fal anlat. Aşk, kariyer/para, sağlık ve yakın gelecek
başlıklarına değin. Falı paragraflar halinde, doğal bir dille yaz.
Astrolojiyi yalnızca hafifçe, en fazla bir-iki cümleyle serpiştir; fal bir astroloji yorumuna dönüşmesin,
odak her zaman kahve falı kalsın.
Kesin tıbbi, hukuki veya finansal tavsiye verme. Bunun eğlence amaçlı olduğunu unutma.
Her zaman Türkçe yanıt ver. Yaklaşık 220-350 kelime yaz.`;

export interface FortuneProfile {
  birthDate?: string | null;
  gender?: string | null;
  maritalStatus?: string | null;
}

export interface FortuneImage {
  /** "Fincan 1", "Tabak" gibi etiket (modele bağlam verir). */
  label?: string;
  /** Ham base64 (data URL öneki olmadan) JPEG/PNG görsel. */
  base64: string;
}

export interface FortuneInput {
  apiKey: string;
  model: string;
  question?: string;
  images?: FortuneImage[];
  profile?: FortuneProfile;
  /** İstemcinin yerel "bugün" etiketi, ör. "30 Haziran 2026 Salı". */
  todayDate?: string;
}

interface OpenAIError {
  error?: { message?: string; code?: string; type?: string };
}

const GENDER_TR: Record<string, string> = { kadin: 'kadın', erkek: 'erkek', diger: 'belirtilmemiş' };
const MARITAL_TR: Record<string, string> = {
  bekar: 'bekâr', evli: 'evli', iliskisi_var: 'bir ilişkisi var', diger: 'belirtilmemiş',
};

// Profil bilgisini falcıya iletilecek kısa bir nota dönüştür.
function profileNote(p?: FortuneProfile): string {
  if (!p) return '';
  const parts: string[] = [];
  if (p.birthDate) parts.push(`doğum tarihi ${p.birthDate} (burcunu ve yaşını buradan çıkarabilirsin)`);
  if (p.gender && GENDER_TR[p.gender]) parts.push(`cinsiyet: ${GENDER_TR[p.gender]}`);
  if (p.maritalStatus && MARITAL_TR[p.maritalStatus]) parts.push(`medeni durum: ${MARITAL_TR[p.maritalStatus]}`);
  if (!parts.length) return '';
  return `\n\nFal baktıran kişi hakkında bilgiler (falı mutlaka bunlara göre kişiselleştir; niyetine ve durumuna odaklan): ${parts.join('; ')}.`;
}

// Bugünün tarihini ve astroloji yönergesini prompta ekle.
function dateNote(todayDate?: string): string {
  const t = (todayDate ?? '').trim().slice(0, 60);
  if (!t) return '';
  return `\n\nBugünün tarihi: ${t}. Yalnızca gerekli görürsen günün enerjisine çok kısa değinebilirsin (zorunlu değil).`;
}

export async function generateFortune(input: FortuneInput): Promise<string> {
  const { apiKey, model, question, images, profile, todayDate } = input;

  const systemPrompt = SYSTEM_PROMPT + profileNote(profile) + dateNote(todayDate);

  const userContent: any[] = [];
  if (images && images.length) {
    const intro = question
      ? `Sana fincan ve tabak fotoğraflarımı gönderiyorum (genelde iki fincan açısı ve bir tabak). Hepsini birlikte değerlendirip falıma bak. Özellikle merak ettiğim: ${question}`
      : 'Sana fincan ve tabak fotoğraflarımı gönderiyorum (genelde iki fincan açısı ve bir tabak). Hepsini birlikte değerlendirip telvedeki şekillerden falıma bak.';
    userContent.push({ type: 'text', text: intro });
    for (const img of images) {
      if (img.label) userContent.push({ type: 'text', text: `${img.label}:` });
      userContent.push({
        type: 'image_url',
        image_url: { url: `data:image/jpeg;base64,${img.base64}` },
      });
    }
  } else {
    userContent.push({
      type: 'text',
      text: question
        ? `Fincanım yok ama niyetime/soruma göre falıma bakar mısın? Niyetim: ${question}`
        : 'Falıma bakar mısın? İçimden geçenleri sezerek bana bir fal anlat.',
    });
  }

  const res = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.9,
      max_tokens: 900,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as OpenAIError & {
    choices?: { message?: { content?: string } }[];
  };

  if (!res.ok) {
    throw new Error(friendlyError(res.status, data.error));
  }

  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('OpenAI boş yanıt döndürdü.');
  return text;
}

// OpenAI hata yanıtını kullanıcı dostu Türkçe mesaja çevir.
function friendlyError(status: number, err?: { message?: string; code?: string; type?: string }): string {
  const code = (err?.code || err?.type || '').toLowerCase();
  const raw = err?.message || '';
  if (status === 401 || code === 'invalid_api_key') {
    return 'OpenAI API anahtarı geçersiz görünüyor. Ayarlar bölümünden anahtarınızı kontrol edip yeniden kaydedin.';
  }
  if (code === 'insufficient_quota' || /quota|billing/i.test(raw)) {
    return 'OpenAI hesabınızın bakiyesi/kotası yetersiz. platform.openai.com → Settings → Billing bölümünden kredi ekleyin (genelde 5$ yeterli). API kullanımı, ChatGPT aboneliğinden ayrı ücretlendirilir.';
  }
  if (status === 429 || code === 'rate_limit_exceeded') {
    return 'OpenAI hız sınırına ulaşıldı. Lütfen birkaç saniye sonra tekrar deneyin.';
  }
  if (code === 'model_not_found' || /does not have access to model|model_not_found/i.test(raw)) {
    return 'Seçili model bu anahtarla kullanılamıyor. Ayarlar\'dan farklı bir model seçin (ör. gpt-4o-mini).';
  }
  return raw || `OpenAI hatası (HTTP ${status})`;
}

/** API anahtarının geçerli olup olmadığını hafifçe doğrular. */
export async function validateApiKey(apiKey: string): Promise<boolean> {
  const res = await fetch(OPENAI_MODELS_URL, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return res.ok;
}
