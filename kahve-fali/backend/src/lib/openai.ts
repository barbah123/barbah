// OpenAI Chat Completions ile kahve falı üretimi (metin ve görsel/vision destekli).

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODELS_URL = 'https://api.openai.com/v1/models';

const SYSTEM_PROMPT = `Sen deneyimli, sıcak ve mistik bir Türk kahve falcısısın.
Kullanıcı sana bir fincan/tabak fotoğrafı ya da bir niyet (soru) iletir.
Fotoğraf varsa telvedeki şekilleri (kuş, yol, yılan, kalp, göz, dağ, balık, gemi vb.) yorumla.
Akıcı, samimi, umut veren ve detaylı bir fal anlat. Aşk, kariyer/para, sağlık ve yakın gelecek
başlıklarına değin. Falı paragraflar halinde, doğal bir dille yaz.
Kesin tıbbi, hukuki veya finansal tavsiye verme. Bunun eğlence amaçlı olduğunu unutma.
Her zaman Türkçe yanıt ver. Yaklaşık 220-350 kelime yaz.`;

export interface FortuneInput {
  apiKey: string;
  model: string;
  question?: string;
  /** Ham base64 (data URL öneki olmadan) JPEG/PNG görsel. */
  imageBase64?: string;
}

interface OpenAIError {
  error?: { message?: string };
}

export async function generateFortune(input: FortuneInput): Promise<string> {
  const { apiKey, model, question, imageBase64 } = input;

  const userContent: any[] = [];
  if (imageBase64) {
    const intro = question
      ? `Fincan fotoğrafıma bakar mısın? Özellikle merak ettiğim: ${question}`
      : 'Fincan fotoğrafıma bakıp falıma bakar mısın?';
    userContent.push({ type: 'text', text: intro });
    userContent.push({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
    });
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
        { role: 'system', content: SYSTEM_PROMPT },
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
    const msg = data.error?.message ?? `OpenAI hatası (HTTP ${res.status})`;
    throw new Error(msg);
  }

  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('OpenAI boş yanıt döndürdü.');
  return text;
}

/** API anahtarının geçerli olup olmadığını hafifçe doğrular. */
export async function validateApiKey(apiKey: string): Promise<boolean> {
  const res = await fetch(OPENAI_MODELS_URL, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return res.ok;
}
