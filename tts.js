import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from './config.js';

// Tạo giọng đọc qua FPT.AI hoặc Azure, lưu cache mp3 theo nội dung câu để không gọi API lặp lại.
const CACHE_DIR = path.resolve('data', 'tts_cache');
const inflight = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function ttsProvider() {
  const { provider, fpt, azure } = CONFIG.tts;
  if (provider === 'fpt' && fpt.apiKey) return 'fpt';
  if (provider === 'azure' && azure.key) return 'azure';
  return 'browser';
}

// Bỏ emoji và ký tự lạ trong tên TikTok để giọng đọc không vấp
export function cleanSpeech(text) {
  return String(text || '')
    .replace(/[^\p{L}\p{N}\s.,!?:;'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

/** @returns {Promise<string|null>} đường dẫn file mp3, hoặc null nếu dùng giọng trình duyệt */
export async function synthesize(rawText) {
  const provider = ttsProvider();
  const text = cleanSpeech(rawText);
  if (provider === 'browser' || !text) return null;

  const voice = provider === 'fpt' ? CONFIG.tts.fpt.voice : CONFIG.tts.azure.voice;
  const key = crypto.createHash('sha1').update(`${provider}|${voice}|${text}`).digest('hex');
  const file = path.join(CACHE_DIR, `${key}.mp3`);
  if (fs.existsSync(file)) return file;
  if (inflight.has(key)) return inflight.get(key);

  const job = (provider === 'fpt' ? fptSpeak(text) : azureSpeak(text))
    .then((buf) => {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(file, buf);
      return file;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

// FPT.AI TTS v5: trả về link mp3 bất đồng bộ, file sẵn sàng sau vài giây nên phải chờ
async function fptSpeak(text) {
  const { apiKey, voice, speed } = CONFIG.tts.fpt;
  const res = await fetch('https://api.fpt.ai/hmi/tts/v5', {
    method: 'POST',
    headers: { api_key: apiKey, voice, speed: String(speed), format: 'mp3', 'Content-Type': 'text/plain; charset=utf-8' },
    body: text,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error !== 0 || !json.async) {
    throw new Error(`FPT TTS lỗi: HTTP ${res.status} ${json.message || ''}`);
  }
  for (let i = 0; i < 24; i++) {
    await sleep(500);
    const r = await fetch(json.async);
    if (r.ok) {
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 500) return buf;
    }
  }
  throw new Error('FPT TTS: hết thời gian chờ file mp3');
}

function escapeXml(s) {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

async function azureSpeak(text) {
  const { key, region, voice, rate } = CONFIG.tts.azure;
  const ssml = `<speak version="1.0" xml:lang="vi-VN"><voice name="${voice}"><prosody rate="${rate}">${escapeXml(text)}</prosody></voice></speak>`;
  const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'phong-sanh-chim',
    },
    body: ssml,
  });
  if (!res.ok) throw new Error(`Azure TTS lỗi: HTTP ${res.status} ${await res.text().catch(() => '')}`);
  return Buffer.from(await res.arrayBuffer());
}
