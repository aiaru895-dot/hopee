import type { Role } from './ryadomTypes';

const mojibakeParts = [
  [0x00d0],
  [0x00d1],
  [0x0420, 0x045f],
  [0x0420, 0x040e],
  [0x0420, 0x045c],
  [0x0420, 0x045e],
  [0x0421, 0x0453],
  [0x0421, 0x0452],
  [0x0412, 0x00b7],
].map((codes) => String.fromCharCode(...codes));

export function cleanDisplayName(value: string | null | undefined, role: Role | null | undefined): string {
  const fallback = role === 'volunteer' ? 'Помощник' : 'Пользователь';
  const text = value?.trim();
  if (!text || looksBroken(text)) return fallback;
  return text;
}

function looksBroken(value: string): boolean {
  if (/[\u0000-\u001f\u007f-\u009f\ufffd]/.test(value)) return true;
  if (mojibakeParts.some((part) => value.includes(part))) return true;

  const visible = Array.from(value).filter((char) => char.trim().length > 0);
  if (visible.length === 0) return true;

  const readable = visible.filter((char) => /[A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі0-9@._ -]/.test(char));
  return readable.length / visible.length < 0.75;
}
