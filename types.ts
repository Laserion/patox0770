export interface ServiceItem {
  id: string;
  number: string;
  label: string;
  detail: string;
}

export interface PaymentAlias {
  platform: string;
  alias: string;
  icon: 'naranja' | 'mercadopago';
}

export interface SiteConfig {
  carImageUrl: string;
  staffImageUrl: string;
  staffName: string;
  staffBio: string;
  phone: string;
  naranjaAlias: string;
  mpAlias: string;
}
