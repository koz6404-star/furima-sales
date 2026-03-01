import type { SortOption } from '@/components/product-search-bar';

export type OrderConfig = {
  column: string;
  ascending: boolean;
  nullsFirst?: boolean;
};

/**
 * ソートオプションをSupabaseのorder用パラメータに変換
 */
export function getOrderForSort(sort: SortOption): OrderConfig {
  switch (sort) {
    case 'updated_desc':
      return { column: 'updated_at', ascending: false };
    case 'updated_asc':
      return { column: 'updated_at', ascending: true };
    case 'received_desc':
      return { column: 'stock_received_at', ascending: false, nullsFirst: false };
    case 'received_asc':
      return { column: 'stock_received_at', ascending: true, nullsFirst: true };
    case 'stock_desc':
      return { column: 'stock', ascending: false };
    case 'stock_asc':
      return { column: 'stock', ascending: true };
    case 'cost_desc':
      return { column: 'cost_yen', ascending: false };
    case 'cost_asc':
      return { column: 'cost_yen', ascending: true };
    case 'name_asc':
      return { column: 'name', ascending: true };
    case 'name_desc':
      return { column: 'name', ascending: false };
    case 'oldest_desc':
      return { column: 'oldest_received_at', ascending: false, nullsFirst: false };
    case 'oldest_asc':
      return { column: 'oldest_received_at', ascending: true, nullsFirst: true };
    case 'target20_desc':
      return { column: 'target_price_20', ascending: false, nullsFirst: false };
    case 'target20_asc':
      return { column: 'target_price_20', ascending: true, nullsFirst: true };
    default:
      return { column: 'updated_at', ascending: false };
  }
}
