import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from './config.js';

// Quản lý playlist nhạc remix cho chế độ Concert.
// Quy tắc bản quyền: bài dạng file chỉ được phát khi license.allowedForLive === true VÀ file tồn tại trong public/.
// Bài dạng "synth" là nhạc do overlay tự sinh bằng Web Audio (không dùng bản ghi của ai), luôn được phát.
const M = () => CONFIG.concert.music;

export class Playlists {
  constructor() {
    this.load();
  }

  load() {
    let raw = { playlists: [] };
    try {
      raw = JSON.parse(fs.readFileSync(path.resolve(M().playlistFile), 'utf8'));
    } catch (err) {
      console.warn('[Concert] Không đọc được playlist:', err.message);
    }
    this.playlists = [];
    this.skipped = [];
    for (const p of raw.playlists || []) {
      const tracks = [];
      for (const t of p.tracks || []) {
        const reason = rejectReason(t);
        if (reason) this.skipped.push({ playlistId: p.playlistId, trackId: t.trackId, title: t.title, reason });
        else tracks.push(t);
      }
      this.playlists.push({ playlistId: p.playlistId, name: p.name, tracks });
    }
    for (const s of this.skipped) console.warn(`[Concert] Bỏ qua bài "${s.title || s.trackId}": ${s.reason}`);
  }

  get(id) {
    return this.playlists.find((p) => p.playlistId === id) || null;
  }

  // Playlist có ít nhất 1 bài phát được
  usable() {
    return this.playlists.filter((p) => p.tracks.length);
  }

  allTracks() {
    return this.playlists.flatMap((p) => p.tracks.map((t) => ({ ...t, playlistId: p.playlistId })));
  }
}

function rejectReason(t) {
  if (!t || !t.trackId) return 'thiếu trackId';
  if (t.type === 'synth') return null;
  if (!t.license || t.license.allowedForLive !== true) return 'chưa có giấy phép phát trên LIVE (license.allowedForLive phải là true)';
  if (!t.file) return 'thiếu đường dẫn file';
  const file = path.resolve('public', t.file);
  if (!file.startsWith(path.resolve('public') + path.sep)) return 'đường dẫn file không hợp lệ';
  if (!fs.existsSync(file)) return `không tìm thấy file public/${t.file}`;
  return null;
}

// Thông tin bài gửi cho overlay (không gửi đường dẫn bằng chứng giấy phép)
export function publicTrack(t) {
  if (!t) return null;
  const { trackId, title, remixer, type, file, bpm, chorusStart, durationSec, key, style, seed } = t;
  return { trackId, title, remixer: remixer || '', type: type || 'file', file: file || '', bpm: bpm || 120, chorusStart: chorusStart || 0, durationSec: durationSec || 0, key: key ?? 0, style: style || 'edm', seed: seed ?? 1 };
}
