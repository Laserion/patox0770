import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';

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

const TMP_DIR = path.join('/tmp', 'patox-data');
const TMP_CONFIG_FILE = path.join(TMP_DIR, 'site-config.json');

function getBlobStore() {
  try {
    return getStore('patox-site');
  } catch {
    return null;
  }
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

function ensureTmp(): void {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
  if (!fs.existsSync(TMP_CONFIG_FILE)) {
    fs.writeFileSync(TMP_CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
  }
}

async function readConfig(): Promise<{ config: SiteConfig; mode: 'netlify-blobs' | 'tmp' }> {
  const store = getBlobStore();
  if (store) {
    try {
      const data = (await store.get('site-config', { type: 'json' })) as Partial<SiteConfig> | null;
      return { config: sanitizeConfig(data), mode: 'netlify-blobs' };
    } catch {
      // fallback to tmp if blobs unavailable
    }
  }
  try {
    ensureTmp();
    const raw = fs.readFileSync(TMP_CONFIG_FILE, 'utf-8');
    return { config: sanitizeConfig(JSON.parse(raw) as Partial<SiteConfig>), mode: 'tmp' };
  } catch {
    return { config: { ...DEFAULT_CONFIG }, mode: 'tmp' };
  }
}

async function writeConfig(next: SiteConfig): Promise<'netlify-blobs' | 'tmp'> {
  const store = getBlobStore();
  if (store) {
    try {
      await store.setJSON('site-config', next);
      return 'netlify-blobs';
    } catch {
      // fallback to tmp
    }
  }
  ensureTmp();
  fs.writeFileSync(TMP_CONFIG_FILE, JSON.stringify(next, null, 2), 'utf-8');
  return 'tmp';
}

async function saveTargetImage(
  target: 'staff' | 'car',
  mime: string,
  base64: string
): Promise<{ url: string; mode: 'netlify-blobs' | 'tmp' }> {
  const ts = Date.now();
  const payload: StoredImage = { mime, base64 };
  const store = getBlobStore();
  let mode: 'netlify-blobs' | 'tmp' = 'tmp';

  if (store) {
    try {
      await store.setJSON(`image-${target}`, payload);
      mode = 'netlify-blobs';
    } catch {
      ensureTmp();
      fs.writeFileSync(path.join(TMP_DIR, `${target}-image.json`), JSON.stringify(payload));
    }
  } else {
    ensureTmp();
    fs.writeFileSync(path.join(TMP_DIR, `${target}-image.json`), JSON.stringify(payload));
  }

  return { url: `/api/image/${target}?v=${ts}`, mode };
}

async function readTargetImage(target: 'staff' | 'car'): Promise<StoredImage | null> {
  const store = getBlobStore();
  if (store) {
    try {
      const data = (await store.get(`image-${target}`, { type: 'json' })) as StoredImage | null;
      if (data) return data;
    } catch {
      // fallback
    }
  }
  try {
    const file = path.join(TMP_DIR, `${target}-image.json`);
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8')) as StoredImage;
    }
  } catch {
    return null;
  }
  return null;
}

async function deleteTargetImage(target: 'staff' | 'car'): Promise<void> {
  const store = getBlobStore();
  if (store) {
    try {
      await store.delete(`image-${target}`);
    } catch {
      // ignore
    }
  }
  try {
    const file = path.join(TMP_DIR, `${target}-image.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
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

function isAuthorized(req: Request): boolean {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  return Boolean(token && verifyToken(token));
}

function jsonResponse(data: unknown, status = 200, cacheControl = 'no-store'): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControl,
    },
  });
}

export const config = {
  path: '/api/*',
};

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const apiPath = url.pathname.replace(/^\/\.netlify\/functions\/api/, '/api');

  if (req.method === 'GET' && apiPath === '/api/health') {
    const { mode } = await readConfig();
    return jsonResponse({ ok: true, persistenceMode: mode });
  }

  if (req.method === 'GET' && apiPath === '/api/config') {
    const { config: cfg, mode } = await readConfig();
    return jsonResponse({ ...cfg, persistenceMode: mode });
  }

  if (req.method === 'POST' && apiPath === '/api/auth/login') {
    try {
      const body = (await req.json()) as { user?: string; pass?: string };
      const user = typeof body.user === 'string' ? body.user.trim() : '';
      const pass = typeof body.pass === 'string' ? body.pass : '';
      if (user === ADMIN_USER && pass === ADMIN_PASS) {
        const { mode } = await readConfig();
        return jsonResponse({ token: signToken(user), persistenceMode: mode });
      }
      return jsonResponse({ error: 'Credenciales incorrectas' }, 401);
    } catch {
      return jsonResponse({ error: 'Solicitud inválida' }, 400);
    }
  }

  if (req.method === 'GET' && apiPath === '/api/auth/verify') {
    if (!isAuthorized(req)) {
      return jsonResponse({ error: 'No autorizado' }, 401);
    }
    const { mode } = await readConfig();
    return jsonResponse({ valid: true, persistenceMode: mode });
  }

  if (req.method === 'PUT' && apiPath === '/api/config') {
    if (!isAuthorized(req)) {
      return jsonResponse({ error: 'No autorizado. Inicie sesión como administrador.' }, 401);
    }
    try {
      const { config: current } = await readConfig();
      const body = (await req.json()) as Partial<SiteConfig>;

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

      const mode = await writeConfig(next);
      return jsonResponse({ ...next, persistenceMode: mode });
    } catch (err) {
      return jsonResponse(
        { error: err instanceof Error ? err.message : 'Error al guardar la configuración.' },
        500
      );
    }
  }

  if (req.method === 'POST' && apiPath === '/api/upload') {
    if (!isAuthorized(req)) {
      return jsonResponse({ error: 'No autorizado. Inicie sesión como administrador.' }, 401);
    }
    try {
      const body = (await req.json()) as { target?: string; dataUrl?: string };
      const target = body.target === 'car' ? 'car' : body.target === 'staff' ? 'staff' : null;
      const dataUrl = typeof body.dataUrl === 'string' ? body.dataUrl : '';

      if (!target) {
        return jsonResponse({ error: 'Destino de imagen inválido' }, 400);
      }

      const match = /^data:(image\/(jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
      if (!match) {
        return jsonResponse({ error: 'Formato de imagen no válido. Use JPG, PNG o WebP.' }, 400);
      }

      const mime = match[1] === 'image/jpg' ? 'image/jpeg' : match[1];
      const base64 = match[3];
      const buffer = Buffer.from(base64, 'base64');

      if (buffer.length > 4 * 1024 * 1024) {
        return jsonResponse({ error: 'La imagen supera el límite de 4 MB.' }, 400);
      }

      const { url: publicUrl } = await saveTargetImage(target, mime, base64);
      const { config: current } = await readConfig();
      const updated: SiteConfig =
        target === 'staff' ? { ...current, staffImageUrl: publicUrl } : { ...current, carImageUrl: publicUrl };

      const mode = await writeConfig(updated);
      return jsonResponse({ url: publicUrl, config: updated, persistenceMode: mode });
    } catch (err) {
      return jsonResponse(
        { error: err instanceof Error ? err.message : 'Error al subir la imagen.' },
        500
      );
    }
  }

  if (req.method === 'GET' && apiPath.startsWith('/api/image/')) {
    const segment = apiPath.replace('/api/image/', '').split('/')[0];
    const target = segment === 'car' ? 'car' : segment === 'staff' ? 'staff' : null;
    if (!target) {
      return new Response('Not found', { status: 404 });
    }

    const stored = await readTargetImage(target);
    if (!stored) {
      return new Response('Not found', { status: 404 });
    }

    return new Response(Buffer.from(stored.base64, 'base64'), {
      status: 200,
      headers: {
        'Content-Type': stored.mime,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  }

  if (req.method === 'DELETE' && apiPath === '/api/staff-photo') {
    if (!isAuthorized(req)) {
      return jsonResponse({ error: 'No autorizado. Inicie sesión como administrador.' }, 401);
    }
    try {
      await deleteTargetImage('staff');
      const { config: current } = await readConfig();
      const updated: SiteConfig = { ...current, staffImageUrl: '' };
      const mode = await writeConfig(updated);
      return jsonResponse({ ...updated, persistenceMode: mode });
    } catch (err) {
      return jsonResponse(
        { error: err instanceof Error ? err.message : 'Error al eliminar la foto.' },
        500
      );
    }
  }

  return jsonResponse({ error: 'Ruta API no encontrada' }, 404);
}
