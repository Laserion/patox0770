import React, { useState, useEffect, useRef } from 'react';
import {
  Phone,
  Copy,
  Check,
  Handshake,
  Car,
  User,
  Star,
  Settings,
  X,
  Save,
  Lock,
  LogIn,
  Key,
  Camera,
  Upload,
  Trash2,
  ArrowUpRight,
  RotateCcw,
  Wallet,
} from 'lucide-react';
import { SERVICES, DEFAULT_SITE_CONFIG, DEFAULT_CAR_IMAGE } from './constants';
import type { SiteConfig } from './types';

const TOKEN_STORAGE_KEY = 'patox_admin_token';

async function resizeImageToDataUrl(file: File, maxSize = 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('El archivo no es una imagen válida.'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('No se pudo procesar la imagen en el navegador.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        resolve(canvas.toDataURL(outputType, 0.88));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

const App: React.FC = () => {
  const [config, setConfig] = useState<SiteConfig>(DEFAULT_SITE_CONFIG);
  const [draftConfig, setDraftConfig] = useState<SiteConfig>(DEFAULT_SITE_CONFIG);

  const [copied, setCopied] = useState<string | null>(null);
  const [carImgError, setCarImgError] = useState(false);
  const [staffImgError, setStaffImgError] = useState(false);

  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [adminFocus, setAdminFocus] = useState<'staff' | 'all'>('all');
  const [adminToken, setAdminToken] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [isUploadingStaff, setIsUploadingStaff] = useState(false);
  const [isUploadingCar, setIsUploadingCar] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const staffFileInputRef = useRef<HTMLInputElement | null>(null);
  const carFileInputRef = useRef<HTMLInputElement | null>(null);
  const quickStaffInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    const loadConfig = async () => {
      try {
        const res = await fetch('/api/config', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as SiteConfig;
        if (active && data) {
          setConfig(data);
          setDraftConfig(data);
          setCarImgError(false);
          setStaffImgError(false);
        }
      } catch {
        // Keep defaults if offline
      }
    };
    loadConfig();

    if (adminToken) {
      fetch('/api/auth/verify', {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
        .then((res) => {
          if (!res.ok && active) {
            setAdminToken(null);
            try {
              sessionStorage.removeItem(TOKEN_STORAGE_KEY);
            } catch {
              // ignore
            }
          }
        })
        .catch(() => {
          // ignore
        });
    }

    return () => {
      active = false;
    };
  }, [adminToken]);

  const cleanPhone = config.phone.replace(/\D/g, '');
  const whatsappHref = `https://wa.me/54${cleanPhone}`;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const openAdminModal = (focus: 'staff' | 'all' = 'all') => {
    setDraftConfig(config);
    setAdminFocus(focus);
    setStatusMessage(null);
    setLoginError('');
    setIsAdminOpen(true);
  };

  const closeAdminModal = () => {
    setIsAdminOpen(false);
    setLoginError('');
    setStatusMessage(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: loginUser, pass: loginPass }),
      });
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !data.token) {
        setLoginError(data.error || 'Credenciales incorrectas');
        return;
      }
      setAdminToken(data.token);
      try {
        sessionStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      } catch {
        // ignore
      }
      setLoginUser('');
      setLoginPass('');
    } catch {
      setLoginError('Error de conexión con el servidor.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleUploadImage = async (file: File, target: 'staff' | 'car') => {
    if (!adminToken) {
      openAdminModal(target === 'staff' ? 'staff' : 'all');
      return;
    }

    const setUploading = target === 'staff' ? setIsUploadingStaff : setIsUploadingCar;
    setUploading(true);
    setStatusMessage(null);

    try {
      const dataUrl = await resizeImageToDataUrl(file, target === 'staff' ? 900 : 1400);
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ target, dataUrl }),
      });

      const payload = (await res.json()) as { url?: string; config?: SiteConfig; error?: string };
      if (res.status === 401) {
        setAdminToken(null);
        try {
          sessionStorage.removeItem(TOKEN_STORAGE_KEY);
        } catch {
          // ignore
        }
        openAdminModal(target === 'staff' ? 'staff' : 'all');
        setLoginError('Su sesión expiró. Ingrese nuevamente.');
        return;
      }

      if (!res.ok || !payload.config) {
        setStatusMessage({ type: 'err', text: payload.error || 'Error al subir la imagen.' });
        return;
      }

      setConfig(payload.config);
      setDraftConfig(payload.config);
      if (target === 'staff') {
        setStaffImgError(false);
        setStatusMessage({ type: 'ok', text: 'Foto del conductor actualizada y visible para todos los visitantes.' });
      } else {
        setCarImgError(false);
        setStatusMessage({ type: 'ok', text: 'Imagen del vehículo actualizada.' });
      }
    } catch (err) {
      setStatusMessage({
        type: 'err',
        text: err instanceof Error ? err.message : 'No se pudo subir la imagen.',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveStaffPhoto = async () => {
    if (!adminToken) return;
    setIsUploadingStaff(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/staff-photo', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!res.ok) {
        setStatusMessage({ type: 'err', text: 'No se pudo quitar la foto.' });
        return;
      }
      const updated = (await res.json()) as SiteConfig;
      setConfig(updated);
      setDraftConfig(updated);
      setStaffImgError(false);
      setStatusMessage({ type: 'ok', text: 'Foto del conductor eliminada.' });
    } catch {
      setStatusMessage({ type: 'err', text: 'Error al quitar la foto.' });
    } finally {
      setIsUploadingStaff(false);
    }
  };

  const saveAdminChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken) return;
    setIsSaving(true);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(draftConfig),
      });

      if (res.status === 401) {
        setAdminToken(null);
        setLoginError('Su sesión expiró. Ingrese nuevamente.');
        return;
      }

      const data = (await res.json()) as SiteConfig & { error?: string };
      if (!res.ok) {
        setStatusMessage({ type: 'err', text: data.error || 'No se pudieron guardar los cambios.' });
        return;
      }

      setConfig(data);
      setDraftConfig(data);
      setCarImgError(false);
      setStaffImgError(false);
      setStatusMessage({ type: 'ok', text: 'Cambios guardados para todos los visitantes.' });
      setTimeout(() => {
        closeAdminModal();
      }, 650);
    } catch {
      setStatusMessage({ type: 'err', text: 'Error de red al guardar los cambios.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleStaffQuickClick = () => {
    if (adminToken) {
      quickStaffInputRef.current?.click();
    } else {
      openAdminModal('staff');
    }
  };

  return (
    <div className="min-h-screen bg-[#080808] bg-texture flex flex-col text-white selection:bg-orange-500/30">
      {/* Hidden quick file input when already authenticated */}
      <input
        ref={quickStaffInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            handleUploadImage(file, 'staff');
          }
          e.target.value = '';
        }}
      />

      {/* --- ADMIN & PHOTO UPLOAD MODAL --- */}
      {isAdminOpen && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Panel de administración"
        >
          <div className="bg-[#111113] border border-white/15 w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl my-auto">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <Settings className="w-5 h-5 text-orange-500" />
                <span className="font-brand font-bold text-sm tracking-tight text-white">
                  {adminFocus === 'staff' ? 'Foto del Conductor y Datos' : 'Panel de Administración'}
                </span>
              </div>
              <button
                type="button"
                onClick={closeAdminModal}
                aria-label="Cerrar panel"
                className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white focus-visible:outline-2 focus-visible:outline-orange-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 md:p-8 max-h-[82vh] overflow-y-auto">
              {!adminToken ? (
                <form onSubmit={handleLogin} className="space-y-5">
                  <div className="text-center space-y-2 pb-2">
                    <div className="w-12 h-12 bg-orange-500/10 border border-orange-500/20 rounded-xl flex items-center justify-center mx-auto">
                      <Lock className="w-6 h-6 text-orange-500" />
                    </div>
                    <h3 className="text-lg font-brand font-bold text-white">Acceso de Conductor</h3>
                    <p className="text-gray-400 text-sm">
                      Ingresá tus credenciales para subir la foto del conductor o actualizar los datos visibles para los visitantes.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label htmlFor="admin-user" className="block text-xs font-medium text-gray-300 mb-1.5">
                        Usuario
                      </label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input
                          id="admin-user"
                          type="text"
                          required
                          autoComplete="username"
                          placeholder="Usuario"
                          value={loginUser}
                          onChange={(e) => setLoginUser(e.target.value)}
                          className="w-full bg-white/5 border border-white/15 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-orange-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="admin-pass" className="block text-xs font-medium text-gray-300 mb-1.5">
                        Contraseña
                      </label>
                      <div className="relative">
                        <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input
                          id="admin-pass"
                          type="password"
                          required
                          autoComplete="current-password"
                          placeholder="Contraseña"
                          value={loginPass}
                          onChange={(e) => setLoginPass(e.target.value)}
                          className="w-full bg-white/5 border border-white/15 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-orange-500"
                        />
                      </div>
                    </div>
                  </div>

                  {loginError && (
                    <p className="text-red-400 text-xs font-medium text-center bg-red-500/10 border border-red-500/20 rounded-lg py-2 px-3">
                      {loginError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={isLoggingIn}
                    className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-60 text-white font-bold text-sm py-3.5 px-6 rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <LogIn className="w-4 h-4" />
                    {isLoggingIn ? 'Verificando...' : 'Ingresar'}
                  </button>
                </form>
              ) : (
                <form onSubmit={saveAdminChanges} className="space-y-6">
                  {statusMessage && (
                    <div
                      className={`text-xs font-medium rounded-xl px-4 py-3 border ${
                        statusMessage.type === 'ok'
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                          : 'bg-red-500/10 border-red-500/30 text-red-300'
                      }`}
                    >
                      {statusMessage.text}
                    </div>
                  )}

                  {/* Staff Photo Upload Box */}
                  <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-white">Foto del Conductor (Nuestro Staff)</h4>
                        <p className="text-xs text-gray-400">Visible públicamente para cualquier visitante del sitio.</p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-4">
                      <div className="w-20 h-20 rounded-full overflow-hidden border border-white/15 bg-[#080808] flex items-center justify-center shrink-0">
                        {config.staffImageUrl && !staffImgError ? (
                          <img
                            src={config.staffImageUrl}
                            alt="Vista previa del conductor"
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <User className="w-9 h-9 text-gray-600" />
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5 flex-1">
                        <input
                          ref={staffFileInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleUploadImage(file, 'staff');
                            e.target.value = '';
                          }}
                        />
                        <button
                          type="button"
                          disabled={isUploadingStaff}
                          onClick={() => staffFileInputRef.current?.click()}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-60 text-white text-xs font-semibold transition-colors cursor-pointer"
                        >
                          <Upload className="w-4 h-4" />
                          {isUploadingStaff ? 'Subiendo...' : 'Subir imagen desde dispositivo'}
                        </button>

                        {config.staffImageUrl && (
                          <button
                            type="button"
                            disabled={isUploadingStaff}
                            onClick={handleRemoveStaffPhoto}
                            className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-red-500/20 border border-white/10 text-gray-300 hover:text-red-300 text-xs font-medium transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Quitar
                          </button>
                        )}
                      </div>
                    </div>

                    <div>
                      <label htmlFor="staff-url-input" className="block text-xs font-medium text-gray-400 mb-1">
                        O pegar URL de imagen externa
                      </label>
                      <input
                        id="staff-url-input"
                        type="text"
                        value={draftConfig.staffImageUrl}
                        onChange={(e) => setDraftConfig({ ...draftConfig, staffImageUrl: e.target.value })}
                        placeholder="https://... o /uploads/..."
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-orange-500"
                      />
                    </div>
                  </div>

                  {/* Car Photo Upload Box */}
                  <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold text-white">Imagen del Vehículo</h4>
                      <button
                        type="button"
                        onClick={() => setDraftConfig({ ...draftConfig, carImageUrl: DEFAULT_CAR_IMAGE })}
                        className="inline-flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Usar Fiat Mobi blanco
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        ref={carFileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUploadImage(file, 'car');
                          e.target.value = '';
                        }}
                      />
                      <button
                        type="button"
                        disabled={isUploadingCar}
                        onClick={() => carFileInputRef.current?.click()}
                        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-medium transition-colors cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        {isUploadingCar ? 'Subiendo...' : 'Subir otra foto del auto'}
                      </button>
                    </div>

                    <input
                      type="text"
                      aria-label="URL Imagen del Auto"
                      value={draftConfig.carImageUrl}
                      onChange={(e) => setDraftConfig({ ...draftConfig, carImageUrl: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-orange-500"
                    />
                  </div>

                  {/* Contact & Payment Fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label htmlFor="admin-phone" className="block text-xs font-medium text-gray-300 mb-1.5">
                        Teléfono de Contacto (WhatsApp)
                      </label>
                      <input
                        id="admin-phone"
                        type="text"
                        value={draftConfig.phone}
                        onChange={(e) => setDraftConfig({ ...draftConfig, phone: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-orange-500 font-mono-nums"
                      />
                    </div>

                    <div>
                      <label htmlFor="admin-naranja" className="block text-xs font-medium text-gray-300 mb-1.5">
                        Alias Naranja X
                      </label>
                      <input
                        id="admin-naranja"
                        type="text"
                        value={draftConfig.naranjaAlias}
                        onChange={(e) => setDraftConfig({ ...draftConfig, naranjaAlias: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-orange-500 font-mono-nums"
                      />
                    </div>

                    <div>
                      <label htmlFor="admin-mp" className="block text-xs font-medium text-gray-300 mb-1.5">
                        Alias Mercado Pago
                      </label>
                      <input
                        id="admin-mp"
                        type="text"
                        value={draftConfig.mpAlias}
                        onChange={(e) => setDraftConfig({ ...draftConfig, mpAlias: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-orange-500 font-mono-nums"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label htmlFor="admin-bio" className="block text-xs font-medium text-gray-300 mb-1.5">
                        Presentación del Conductor
                      </label>
                      <textarea
                        id="admin-bio"
                        rows={3}
                        value={draftConfig.staffBio}
                        onChange={(e) => setDraftConfig({ ...draftConfig, staffBio: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-orange-500 resize-none"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSaving}
                    className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-60 text-white font-bold text-sm py-3.5 px-6 rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- TOP NAVIGATION BAR (3-Zone Contract) --- */}
      <header className="w-full border-b border-white/10 bg-[#080808]/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <a
            href="#inicio"
            onDoubleClick={() => openAdminModal('all')}
            className="font-brand font-black text-2xl tracking-tight text-white whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-orange-500 rounded"
          >
            PATOX<span className="text-orange-500">0770</span>
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-gray-300" aria-label="Navegación principal">
            <a href="#viajes" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              Viajes
            </a>
            <a href="#cobros" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              Datos de Cobro
            </a>
            <a href="#staff" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              Nuestro Staff
            </a>
          </nav>

          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs sm:text-sm font-bold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-white"
          >
            <Phone className="w-4 h-4" />
            <span>Reservar Viaje</span>
          </a>
        </div>
      </header>

      {/* --- HERO & SERVICES SPLIT --- */}
      <main id="inicio" className="w-full max-w-6xl mx-auto px-6 pt-10 pb-12 md:pt-14 md:pb-16">
        <div className="mb-8 md:mb-10 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-orange-400">
            <span>Uber Premium</span>
            <span aria-hidden="true" className="text-gray-600">·</span>
            <span>DiDi Fleet</span>
            <span aria-hidden="true" className="text-gray-600">·</span>
            <span className="text-gray-400">Córdoba, Argentina</span>
          </div>
          <h1
            className="font-brand font-black tracking-tight text-white max-w-3xl leading-[1.08]"
            style={{ fontSize: 'clamp(2.1rem, 4vw, 3.5rem)', textWrap: 'balance' }}
          >
            Transporte ejecutivo y privado en Córdoba
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
          {/* Left: Fiat Mobi Blanco Showcase */}
          <div className="lg:col-span-7 flex flex-col">
            <div className="relative flex-1 min-h-[280px] sm:min-h-[360px] rounded-2xl overflow-hidden border border-white/10 bg-[#111113]">
              {!carImgError ? (
                <img
                  src={config.carImageUrl || DEFAULT_CAR_IMAGE}
                  alt="Fiat Mobi Blanco - PATOX0770 Transporte en Córdoba"
                  referrerPolicy="no-referrer"
                  onError={() => setCarImgError(true)}
                  className="w-full h-full object-cover object-center transition-transform duration-500 hover:scale-[1.02]"
                />
              ) : (
                <div className="w-full h-full min-h-[320px] flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-[#141416] to-[#0b0b0c]">
                  <Car className="w-16 h-16 text-orange-500/40 mb-3" />
                  <p className="font-brand font-bold text-lg text-gray-300">Fiat Mobi Blanco</p>
                  <p className="text-xs text-gray-500 mt-1">Unidad habilitada para traslados en Córdoba</p>
                </div>
              )}

              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-5 sm:p-6">
                <p className="text-xs font-medium text-orange-400">Vehículo Asignado</p>
                <p className="font-brand font-bold text-lg sm:text-xl text-white">
                  Fiat Mobi Blanco · Confort urbano y climatización
                </p>
              </div>
            </div>
          </div>

          {/* Right: Nuestros Viajes & Primary Booking CTA */}
          <div id="viajes" className="lg:col-span-5 flex flex-col justify-between gap-6">
            <div className="space-y-4">
              <div className="flex items-baseline justify-between border-b border-white/10 pb-3">
                <h2 className="font-brand font-extrabold text-2xl text-white tracking-tight">Nuestros Viajes</h2>
                <span className="text-xs font-medium text-gray-400">5 modalidades</span>
              </div>

              <ul className="space-y-2.5">
                {SERVICES.map((service) => (
                  <li
                    key={service.id}
                    className="flex items-start gap-4 p-3.5 rounded-xl bg-[#111113] border border-white/10 hover:border-orange-500/40 transition-colors"
                  >
                    <span className="font-mono-nums text-xs font-bold text-orange-500 pt-1 shrink-0">
                      {service.number}.
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-base text-white leading-snug">{service.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{service.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-4 bg-orange-600 hover:bg-orange-500 text-white py-4 px-6 rounded-2xl transition-colors group focus-visible:outline-2 focus-visible:outline-white"
            >
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-black/20 flex items-center justify-center shrink-0">
                  <Phone className="w-5 h-5 text-white" />
                </div>
                <div>
                  <span className="block text-xs font-medium text-orange-100">Reserva directa por WhatsApp</span>
                  <span className="font-brand font-black text-2xl sm:text-3xl tracking-tight font-mono-nums">
                    {config.phone}
                  </span>
                </div>
              </div>
              <ArrowUpRight className="w-5 h-5 text-white/80 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform shrink-0" />
            </a>
          </div>
        </div>
      </main>

      {/* --- PROMINENT PAYMENT SECTION (DATOS DE COBRO) --- */}
      <section id="cobros" className="w-full max-w-6xl mx-auto px-6 py-8 md:py-12">
        <div className="rounded-2xl border border-orange-500/25 bg-[#111113] p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6 pb-4 border-b border-white/10">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-orange-400 mb-1">
                <Wallet className="w-4 h-4" />
                <span>Transferencias inmediatas</span>
              </div>
              <h2 className="font-brand font-extrabold text-2xl sm:text-3xl text-white tracking-tight">
                Datos de Cobro
              </h2>
            </div>
            <p className="text-sm text-gray-400">
              Tocá el botón para copiar el alias y abonar tu viaje al instante.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            {/* Naranja X Card */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl bg-[#0a0a0c] border border-white/10 hover:border-[#ff4500]/50 transition-colors">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-12 h-12 shrink-0 bg-[#ff4500] rounded-xl flex items-center justify-center">
                  <span className="text-2xl font-black text-white italic">N</span>
                </div>
                <div className="min-w-0">
                  <span className="block text-xs font-medium text-gray-400">Alias Naranja X</span>
                  <span className="block text-xl sm:text-2xl font-bold text-white font-mono-nums truncate">
                    {config.naranjaAlias}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => copyToClipboard(config.naranjaAlias, 'naranja')}
                className={`inline-flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] rounded-xl text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  copied === 'naranja'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-[#ff4500]/15 hover:bg-[#ff4500] text-orange-300 hover:text-white border border-[#ff4500]/30'
                }`}
              >
                {copied === 'naranja' ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copiar alias</span>
                  </>
                )}
              </button>
            </div>

            {/* Mercado Pago Card */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl bg-[#0a0a0c] border border-white/10 hover:border-[#009ee3]/50 transition-colors">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-12 h-12 shrink-0 bg-[#009ee3] rounded-xl flex items-center justify-center">
                  <Handshake className="w-6 h-6 text-white" />
                </div>
                <div className="min-w-0">
                  <span className="block text-xs font-medium text-gray-400">Alias Mercado Pago</span>
                  <span className="block text-xl sm:text-2xl font-bold text-white font-mono-nums truncate">
                    {config.mpAlias}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => copyToClipboard(config.mpAlias, 'mp')}
                className={`inline-flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] rounded-xl text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  copied === 'mp'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-[#009ee3]/15 hover:bg-[#009ee3] text-sky-300 hover:text-white border border-[#009ee3]/30'
                }`}
              >
                {copied === 'mp' ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copiar alias</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* --- NUESTRO STAFF SECTION --- */}
      <section id="staff" className="w-full max-w-6xl mx-auto px-6 py-8 md:py-12 mb-12">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
          <div>
            <h2 className="font-brand font-extrabold text-3xl text-white tracking-tight">Nuestro Staff</h2>
            <p className="text-sm text-gray-400 mt-1">Atención directa y personalizada en cada traslado.</p>
          </div>
          <button
            type="button"
            onClick={handleStaffQuickClick}
            disabled={isUploadingStaff}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-white/5 hover:bg-orange-600/20 border border-white/15 hover:border-orange-500/40 text-sm font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Camera className="w-4 h-4 text-orange-400" />
            <span>{isUploadingStaff ? 'Subiendo foto...' : config.staffImageUrl ? 'Cambiar foto del conductor' : 'Subir foto del conductor'}</span>
          </button>
        </div>

        <div className="bg-[#111113] border border-white/10 rounded-2xl p-6 sm:p-10 flex flex-col md:flex-row items-center gap-8 md:gap-10">
          {/* Driver Avatar + Direct Upload Trigger */}
          <div className="relative shrink-0 flex flex-col items-center gap-3">
            <div className="w-44 h-44 sm:w-52 sm:h-52 rounded-full border-2 border-orange-500/40 p-1.5 bg-[#080808]">
              <div className="w-full h-full rounded-full overflow-hidden bg-white/[0.04] flex items-center justify-center">
                {config.staffImageUrl && !staffImgError ? (
                  <img
                    src={config.staffImageUrl}
                    alt={`Conductor ${config.staffName}`}
                    referrerPolicy="no-referrer"
                    onError={() => setStaffImgError(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-center px-4">
                    <User className="w-16 h-16 text-gray-600 mb-2" />
                    <span className="text-xs text-gray-500">Sin foto cargada</span>
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={handleStaffQuickClick}
              disabled={isUploadingStaff}
              aria-label="Subir foto del conductor"
              className="absolute bottom-1 right-1 w-11 h-11 rounded-full bg-orange-600 hover:bg-orange-500 text-white border-2 border-[#111113] flex items-center justify-center shadow-lg transition-colors cursor-pointer"
              title="Subir o cambiar foto del conductor"
            >
              <Camera className="w-5 h-5" />
            </button>
          </div>

          {/* Driver Details */}
          <div className="flex flex-col items-center md:items-start text-center md:text-left space-y-3 flex-1">
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 text-xs font-medium text-gray-300">
              <span className="text-orange-400 font-semibold">Conductor Verificado</span>
              <span aria-hidden="true" className="text-gray-600">·</span>
              <span className="inline-flex items-center gap-1 text-amber-400 font-mono-nums">
                <Star className="w-3.5 h-3.5 fill-current" />
                5.0 Calificación
              </span>
              <span aria-hidden="true" className="text-gray-600">·</span>
              <span>Córdoba</span>
            </div>

            <h3 className="font-brand font-black text-3xl sm:text-4xl text-white tracking-tight">
              {config.staffName}
            </h3>

            <p className="text-gray-300 text-sm sm:text-base leading-relaxed max-w-xl">
              {config.staffBio}
            </p>

            <div className="pt-2 flex flex-wrap items-center justify-center md:justify-start gap-3">
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-medium text-white transition-colors"
              >
                <Phone className="w-4 h-4 text-orange-400" />
                <span className="font-mono-nums">{config.phone}</span>
              </a>

              <button
                type="button"
                onClick={() => openAdminModal('all')}
                className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
              >
                <Settings className="w-4 h-4" />
                <span>Administrar sitio</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* --- QUIET FOOTER --- */}
      <footer className="w-full mt-auto border-t border-white/10 bg-[#050505] py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-500">
          <p>
            &copy; {new Date().getFullYear()}{' '}
            <button
              type="button"
              onDoubleClick={() => openAdminModal('all')}
              className="font-semibold text-gray-400 hover:text-orange-400 transition-colors cursor-pointer"
            >
              PATOX0770
            </button>{' '}
            · Servicio Profesional de Transporte
          </p>
          <p>Córdoba · Argentina</p>
        </div>
      </footer>

      {/* --- MOBILE FLOATING WHATSAPP CTA --- */}
      <a
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Reservar por WhatsApp"
        className="fixed bottom-5 right-5 lg:hidden inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-3.5 rounded-full shadow-lg transition-colors z-50"
      >
        <Phone className="w-5 h-5" />
        <span className="text-sm font-bold">WhatsApp</span>
      </a>
    </div>
  );
};

export default App;
