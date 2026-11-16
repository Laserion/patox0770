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

const PORT = Number(process.env.PORT || 3000);
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

const DATA_DIR = path.resolve(process.cwd(), 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const CONFIG_FILE = path.join(DATA_DIR, 'site-config.json');

function ensureStorage(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
  }
}

function readConfig(): SiteConfig {
  ensureStorage();
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<SiteConfig>;
    const merged: SiteConfig = {
      ...DEFAULT_CONFIG,
      ...parsed,
    };
    if (!merged.carImageUrl || merged.carImageUrl.includes('images.unsplash.com')) {
      merged.carImageUrl = DEFAULT_CAR_IMAGE;
    }
    return merged;
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function writeConfig(next: SiteConfig): void {
  ensureStorage();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), 'utf-8');
}

function signToken(username: string): string {
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 7; // 7 days
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

function removeOldTargetUploads(target: 'staff' | 'car', keepFilename?: string): void {
  try {
    const files = fs.readdirSync(UPLOADS_DIR);
    for (const file of files) {
      if (file.startsWith(`${target}-`) && file !== keepFilename) {
        fs.unlinkSync(path.join(UPLOADS_DIR, file));
      }
    }
  } catch {
    // Ignore cleanup errors
  }
}

async function startServer(): Promise<void> {
  ensureStorage();

  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '1d' }));

  app.get('/api/config', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(readConfig());
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const body = (req.body || {}) as { user?: string; pass?: string };
    const user = typeof body.user === 'string' ? body.user.trim() : '';
    const pass = typeof body.pass === 'string' ? body.pass : '';

    if (user === ADMIN_USER && pass === ADMIN_PASS) {
      res.json({ token: signToken(user) });
      return;
    }
    res.status(401).json({ error: 'Credenciales incorrectas' });
  });

  app.get('/api/auth/verify', requireAdmin, (_req: Request, res: Response) => {
    res.json({ valid: true });
  });

  app.put('/api/config', requireAdmin, (req: Request, res: Response) => {
    const current = readConfig();
    const body = (req.body || {}) as Partial<SiteConfig>;

    const next: SiteConfig = {
      carImageUrl:
        typeof body.carImageUrl === 'string' && body.carImageUrl.trim()
          ? body.carImageUrl.trim()
          : current.carImageUrl,
      staffImageUrl: typeof body.staffImageUrl === 'string' ? body.staffImageUrl.trim() : current.staffImageUrl,
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

    writeConfig(next);
    res.json(next);
  });

  app.post('/api/upload', requireAdmin, (req: Request, res: Response) => {
    const body = (req.body || {}) as { target?: string; dataUrl?: string };
    const target = body.target === 'car' ? 'car' : body.target === 'staff' ? 'staff' : null;
    const dataUrl = typeof body.dataUrl === 'string' ? body.dataUrl : '';

    if (!target) {
      res.status(400).json({ error: 'Destino de imagen inválido' });
      return;
    }

    const match = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match) {
      res.status(400).json({ error: 'Formato de imagen no válido. Use JPG, PNG o WebP.' });
      return;
    }

    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const buffer = Buffer.from(match[2], 'base64');

    if (buffer.length > 10 * 1024 * 1024) {
      res.status(400).json({ error: 'La imagen supera el límite de 10 MB.' });
      return;
    }

    const filename = `${target}-${Date.now()}.${ext}`;
    const filepath = path.join(UPLOADS_DIR, filename);
    fs.writeFileSync(filepath, buffer);
    removeOldTargetUploads(target, filename);

    const publicUrl = `/uploads/${filename}`;
    const current = readConfig();
    const updated: SiteConfig =
      target === 'staff' ? { ...current, staffImageUrl: publicUrl } : { ...current, carImageUrl: publicUrl };

    writeConfig(updated);
    res.json({ url: publicUrl, config: updated });
  });

  app.delete('/api/staff-photo', requireAdmin, (_req: Request, res: Response) => {
    removeOldTargetUploads('staff');
    const current = readConfig();
    const updated: SiteConfig = { ...current, staffImageUrl: '' };
    writeConfig(updated);
    res.json(updated);
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
