import type { Request, Response } from 'express';
import { createApiApp } from '../lib/backend';

const app = createApiApp();

export default function handler(req: Request, res: Response): void {
  const routeParam = req.query?.route;
  if (typeof routeParam === 'string' && routeParam.length > 0) {
    const urlObj = new URL(req.url || '/', 'http://localhost');
    urlObj.searchParams.delete('route');
    const qs = urlObj.searchParams.toString();
    req.url = `/api/${routeParam}${qs ? `?${qs}` : ''}`;
  }
  app(req, res);
}
