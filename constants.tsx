import type { ServiceItem, PaymentAlias, SiteConfig } from './types';

export const DEFAULT_CAR_IMAGE = '/assets/aistudio/Fiat_MOBI3_7609cc28.jpg';

export const SERVICES: ServiceItem[] = [
  { id: '1', number: '01', label: 'Empresariales', detail: 'Traslados corporativos y ejecutivos con puntualidad garantizada' },
  { id: '2', number: '02', label: 'Personales', detail: 'Viajes puerta a puerta seguros dentro y fuera de la ciudad' },
  { id: '3', number: '03', label: 'Escolares', detail: 'Recorridos programados con seguimiento y confianza familiar' },
  { id: '4', number: '04', label: 'Universitarios', detail: 'Traslados diarios a Ciudad Universitaria y facultades' },
  { id: '5', number: '05', label: 'Especiales', detail: 'Eventos, aeropuertos y reservas con horario coordinado' },
];

export const PAYMENT_ALIASES: PaymentAlias[] = [
  { platform: 'Alias Naranja X', alias: 'Patox0770', icon: 'naranja' },
  { platform: 'Alias Mercado Pago', alias: 'Patox1977', icon: 'mercadopago' },
];

export const CONTACT = {
  phone: '351 4087100',
  phoneRaw: '3514087100',
  whatsappUrl: 'https://wa.me/543514087100',
};

export const DEFAULT_SITE_CONFIG: SiteConfig = {
  carImageUrl: DEFAULT_CAR_IMAGE,
  staffImageUrl: '',
  staffName: 'PATOX0770',
  staffBio:
    'Comprometido con la puntualidad y la seguridad en cada trayecto. Especialista en traslados ejecutivos y servicios personalizados en toda el área de Córdoba.',
  phone: CONTACT.phone,
  naranjaAlias: PAYMENT_ALIASES[0].alias,
  mpAlias: PAYMENT_ALIASES[1].alias,
};
