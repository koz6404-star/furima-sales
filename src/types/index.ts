export type PlatformType = 'mercari' | 'rakuma';
export type RoundingType = 'floor' | 'ceil' | 'round';

export interface FeeRate {
  id: string;
  platform: PlatformType;
  display_name: string;
  rate_percent: number;
  rakuma_rank: number | null;
}

export interface ShippingRate {
  id: string;
  platform: PlatformType;
  display_name: string;
  base_fee_yen: number;
  size_label: string | null;
  is_custom: boolean;
}

export interface MaterialFee {
  id: string;
  platform: PlatformType;
  display_name: string;
  fee_yen: number;
}

export interface Product {
  id: string;
  user_id: string;
  sku: string | null;
  sku_locked?: boolean;
  custom_sku?: string | null;
  name: string;
  cost_yen: number;
  stock: number;
  image_url: string | null;
  memo: string | null;
  created_at: string;
  updated_at: string;
}

export interface Sale {
  id: string;
  product_id: string;
  quantity: number;
  unit_price_yen: number;
  platform: PlatformType;
  fee_rate_percent: number;
  fee_yen: number;
  shipping_yen: number;
  material_yen: number;
  gross_profit_yen: number;
  sold_at: string;
}

export interface AppSettings {
  platform: PlatformType;
  fee_rate_id: string | null;
  rounding: RoundingType;
  include_material_in_shipping: boolean;
  rakuma_manual_rank: number | null;
}
