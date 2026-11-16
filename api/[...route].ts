import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';

interface SiteConfig {
  carImageUrl: string;
  staffImageUrl: string;
  staffName: string;
  staffBio: string;
  phone: string;
  naranjaAlias: string;
  mpAlias: string;
}

interface StoredImage {
  mime: string;
  base64: string;
}

type PersistenceMode = 'redis' | 'tmp';

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'iks8472uss.';
const AUTH_SECRET =
  process.env.AUTH_SECRET ||
  crypto.createHash('sha256').update(`${ADMIN_USER}:${ADMIN_PASS}:patox0770-salt`).digest('hex');

const DEFAULT_CAR_IMAGE = '/assets/aistudio/Fiat_MOBI3_7609cc28.jpg';

const DEFAULT_CONFIG: SiteConfig = {
  carImageUrl: DEFAULT_CAR_IMAGE,
  staffImageUrl: '',
  staffName: 'PATOX0770',
  staffBio:
    'Comprometido con la puntualidad y la seguridad en cada trayecto. Especialista en traslados ejecutivos y servicios personalizados en toda el área de Córdoba.',
  phone: '351 4087100',
  naranjaAlias: 'Patox0770',
  mpAlias: 'Patox1977',
};

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

const TMP_DIR = path.join('/tmp', 'patox-data');
const TMP_CONFIG_FILE = path.join(TMP_DIR, 'site-config.json');

function getPersistenceMode(): PersistenceMode {
  return REDIS_URL && REDIS_TOKEN ? 'redis' : 'tmp';
}

function ensureTmpStorage(): void {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
  if (!fs.existsSync(TMP_CONFIG_FILE)) {
    fs.writeFileSync(TMP_CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
  }
}

async function redisCommand<T = unknown>(args: unknown[]): Promise<T | null> {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    throw new Error(`Redis REST error: ${res.status}`);
  }
  const data = (await res.json()) as { result?: T };
  return data.result ?? null;
}

function sanitizeConfig(parsed: Partial<SiteConfig> | null | undefined): SiteConfig {
  const merged: SiteConfig = {
    ...DEFAULT_CONFIG,
    ...(parsed || {}),
  };
  if (!merged.carImageUrl || merged.carImageUrl.includes('images.unsplash.com')) {
    merged.carImageUrl = DEFAULT_CAR_IMAGE;
  }
  return merged;
}

async function readConfig(): Promise<SiteConfig> {
  if (getPersistenceMode() === 'redis') {
    try {
      const raw = await redisCommand<string>(['GET', 'patox:site_config']);
      if (raw) {
        return sanitizeConfig(JSON.parse(raw) as Partial<SiteConfig>);
      }
      return { ...DEFAULT_CONFIG };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  try {
    ensureTmpStorage();
    const raw = fs.readFileSync(TMP_CONFIG_FILE, 'utf-8');
    return sanitizeConfig(JSON.parse(raw) as Partial<SiteConfig>);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

async function writeConfig(next: SiteConfig): Promise<void> {
  if (getPersistenceMode() === 'redis') {
    await redisCommand(['SET', 'patox:site_config', JSON.stringify(next)]);
    return;
  }
  ensureTmpStorage();
  fs.writeFileSync(TMP_CONFIG_FILE, JSON.stringify(next, null, 2), 'utf-8');
}

async function saveTargetImage(
  target: 'staff' | 'car',
  mime: string,
  base64: string
): Promise<string> {
  const ts = Date.now();
  const stored: StoredImage = { mime, base64 };

  if (getPersistenceMode() === 'redis') {
    await redisCommand(['SET', `patox:image:${target}`, JSON.stringify(stored)]);
  } else {
    ensureTmpStorage();
    fs.writeFileSync(path.join(TMP_DIR, `${target}-image.json`), JSON.stringify(stored));
  }

  return `/api/image/${target}?v=${ts}`;
}

async function readTargetImage(target: 'staff' | 'car'): Promise<StoredImage | null> {
  if (getPersistenceMode() === 'redis') {
    try {
      const raw = await redisCommand<string>(['GET', `patox:image:${target}`]);
      if (!raw) return null;
      return JSON.parse(raw) as StoredImage;
    } catch {
      return null;
    }
  }

  try {
    const jsonPath = path.join(TMP_DIR, `${target}-image.json`);
    if (fs.existsSync(jsonPath)) {
      return JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as StoredImage;
    }
  } catch {
    return null;
  }
  return null;
}

async function deleteTargetImage(target: 'staff' | 'car'): Promise<void> {
  if (getPersistenceMode() === 'redis') {
    await redisCommand(['DEL', `patox:image:${target}`]);
    return;
  }
  try {
    const jsonPath = path.join(TMP_DIR, `${target}-image.json`);
    if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
  } catch {
    // ignore
  }
}

function signToken(username: string): string {
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 7;
  const payload = Buffer.from(JSON.stringify({ sub: username, exp: expiresAt })).toString('base64url');
  const signature = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifyToken(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, signature] = parts;
  const expected = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return false;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as {
      sub?: string;
      exp?: number;
    };
    return Boolean(parsed.sub === ADMIN_USER && parsed.exp && parsed.exp > Date.now());
  } catch {
    return false;
  }
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token || !verifyToken(token)) {
    res.status(401).json({ error: 'No autorizado. Inicie sesión como administrador.' });
    return;
  }
  next();
}

const app = express();

// Vercel parses JSON bodies before invoking Node handlers; prevent body-parser from hanging on an already-consumed stream
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (req.body !== undefined) {
    (req as unknown as { _body?: boolean })._body = true;
  }
  next();
});
app.use(express.json({ limit: '15mb' }));

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true, persistenceMode: getPersistenceMode() });
});

app.get('/api/config', async (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  const cfg = await readConfig();
  res.json({ ...cfg, persistenceMode: getPersistenceMode() });
});

app.post('/api/auth/login', (req: Request, res: Response) => {
  const body = (req.body || {}) as { user?: string; pass?: string };
  const user = typeof body.user === 'string' ? body.user.trim() : '';
  const pass = typeof body.pass === 'string' ? body.pass : '';

  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    res.json({ token: signToken(user), persistenceMode: getPersistenceMode() });
    return;
  }
  res.status(401).json({ error: 'Credenciales incorrectas' });
});

app.get('/api/auth/verify', requireAdmin, (_req: Request, res: Response) => {
  res.json({ valid: true, persistenceMode: getPersistenceMode() });
});

app.put('/api/config', requireAdmin, async (req: Request, res: Response) => {
  try {
    const current = await readConfig();
    const body = (req.body || {}) as Partial<SiteConfig>;

    const next: SiteConfig = {
      carImageUrl:
        typeof body.carImageUrl === 'string' && body.carImageUrl.trim()
          ? body.carImageUrl.trim()
          : current.carImageUrl,
      staffImageUrl:
        typeof body.staffImageUrl === 'string' ? body.staffImageUrl.trim() : current.staffImageUrl,
      staffName:
        typeof body.staffName === 'string' && body.staffName.trim()
          ? body.staffName.trim().slice(0, 40)
          : current.staffName,
      staffBio:
        typeof body.staffBio === 'string' && body.staffBio.trim()
          ? body.staffBio.trim().slice(0, 400)
          : current.staffBio,
      phone:
        typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim().slice(0, 30) : current.phone,
      naranjaAlias:
        typeof body.naranjaAlias === 'string' && body.naranjaAlias.trim()
          ? body.naranjaAlias.trim().slice(0, 60)
          : current.naranjaAlias,
      mpAlias:
        typeof body.mpAlias === 'string' && body.mpAlias.trim()
          ? body.mpAlias.trim().slice(0, 60)
          : current.mpAlias,
    };

    await writeConfig(next);
    res.json({ ...next, persistenceMode: getPersistenceMode() });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Error al guardar la configuración.',
    });
  }
});

app.post('/api/upload', requireAdmin, async (req: Request, res: Response) => {
  try {
    const body = (req.body || {}) as { target?: string; dataUrl?: string };
    const target = body.target === 'car' ? 'car' : body.target === 'staff' ? 'staff' : null;
    const dataUrl = typeof body.dataUrl === 'string' ? body.dataUrl : '';

    if (!target) {
      res.status(400).json({ error: 'Destino de imagen inválido' });
      return;
    }

    const match = /^data:(image\/(jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match) {
      res.status(400).json({ error: 'Formato de imagen no válido. Use JPG, PNG o WebP.' });
      return;
    }

    const mime = match[1] === 'image/jpg' ? 'image/jpeg' : match[1];
    const base64 = match[3];
    const buffer = Buffer.from(base64, 'base64');

    if (buffer.length > 4 * 1024 * 1024) {
      res.status(400).json({ error: 'La imagen supera el límite de 4 MB.' });
      return;
    }

    const publicUrl = await saveTargetImage(target, mime, base64);
    const current = await readConfig();
    const updated: SiteConfig =
      target === 'staff' ? { ...current, staffImageUrl: publicUrl } : { ...current, carImageUrl: publicUrl };

    await writeConfig(updated);
    res.json({ url: publicUrl, config: updated, persistenceMode: getPersistenceMode() });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Error al subir la imagen.',
    });
  }
});

app.get('/api/image/:target', async (req: Request, res: Response) => {
  const rawTarget = req.params.target;
  const target = rawTarget === 'car' ? 'car' : rawTarget === 'staff' ? 'staff' : null;
  if (!target) {
    res.status(404).end();
    return;
  }

  const stored = await readTargetImage(target);
  if (!stored) {
    res.status(404).end();
    return;
  }

  res.setHeader('Content-Type', stored.mime);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(Buffer.from(stored.base64, 'base64'));
});

app.delete('/api/staff-photo', requireAdmin, async (_req: Request, res: Response) => {
  try {
    await deleteTargetImage('staff');
    const current = await readConfig();
    const updated: SiteConfig = { ...current, staffImageUrl: '' };
    await writeConfig(updated);
    res.json({ ...updated, persistenceMode: getPersistenceMode() });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Error al eliminar la foto.',
    });
  }
});

export default function handler(req: Request, res: Response): void {
  app(req, res);
}
