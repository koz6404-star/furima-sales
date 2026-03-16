/**
 * sales_amount_yen = 0 の診断API
 * 原因特定のため、0円の注文とその raw データを返す
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: zeroRows } = await supabase
      .from('amazon_sales_lines')
      .select('order_id, order_item_id, order_date, sku, product_name, quantity, fulfillment_type, sales_amount_yen')
      .eq('user_id', user.id)
      .eq('sales_amount_yen', 0)
      .order('order_date', { ascending: false });

    if (!zeroRows || zeroRows.length === 0) {
      return NextResponse.json({
        ok: true,
        zeroCount: 0,
        message: 'sales_amount_yen = 0 のレコードはありません',
      });
    }

    const orderIds = [...new Set(zeroRows.map((r) => r.order_id))];
    const sourceKeys = zeroRows.map((r) => `${r.order_id}|${r.order_item_id}`);

    const [ordersRes, itemsRes] = await Promise.all([
      supabase
        .from('amazon_orders_raw')
        .select('source_key, payload_json')
        .eq('user_id', user.id)
        .in('source_key', orderIds),
      supabase
        .from('amazon_order_items_raw')
        .select('source_key, payload_json')
        .eq('user_id', user.id)
        .in('source_key', sourceKeys),
    ]);

    const orderMap = new Map(
      (ordersRes.data ?? []).map((o) => [o.source_key as string, o.payload_json as Record<string, unknown>])
    );
    const itemMap = new Map(
      (itemsRes.data ?? []).map((i) => [i.source_key as string, i.payload_json as Record<string, unknown>])
    );

    const details = zeroRows.map((row) => {
      const itemKey = `${row.order_id}|${row.order_item_id}`;
      const orderPayload = orderMap.get(row.order_id);
      const itemPayload = itemMap.get(itemKey);

      const itemPrice = itemPayload?.ItemPrice ?? itemPayload?.itemPrice;
      const amountStr = itemPrice?.Amount ?? itemPrice?.amount;
      const hasItemPrice = itemPrice != null;
      const hasAmount = amountStr != null && String(amountStr).trim() !== '';
      const amountValue = amountStr;

      const orderStatus = orderPayload?.OrderStatus ?? orderPayload?.orderStatus;
      const fulfillmentChannel = orderPayload?.FulfillmentChannel ?? orderPayload?.fulfillmentChannel;

      const classification: string[] = [];
      if (!hasItemPrice) classification.push('ItemPriceがnull/未定義');
      else if (!hasAmount) classification.push('ItemPrice.Amountがnull/空');
      else if (String(amountValue) === '0' || String(amountValue) === '0.00')
        classification.push('APIでAmountが0または0.00');
      if (orderStatus === 'Pending' || orderStatus === 'PendingAvailability')
        classification.push('注文ステータスがPending（API仕様で価格非返却）');
      if (itemPayload?.PromotionDiscount != null || itemPayload?.promotionDiscount != null)
        classification.push('PromotionDiscountあり');
      if (itemPayload?.IsGift === true || itemPayload?.isGift === true) classification.push('ギフト品');

      return {
        order_id: row.order_id,
        order_item_id: row.order_item_id,
        order_date: row.order_date,
        sku: row.sku,
        product_name: row.product_name,
        quantity: row.quantity,
        fulfillment_type: row.fulfillment_type,
        order_status: orderStatus,
        fulfillment_channel: fulfillmentChannel,
        has_item_price: hasItemPrice,
        has_amount: hasAmount,
        amount_raw: amountValue,
        item_price_structure: itemPrice,
        promotion_discount: itemPayload?.PromotionDiscount ?? itemPayload?.promotionDiscount,
        shipping_price: itemPayload?.ShippingPrice ?? itemPayload?.shippingPrice,
        classification,
        payload_keys: itemPayload ? Object.keys(itemPayload) : [],
      };
    });

    const byClassification = new Map<string, number>();
    for (const d of details) {
      const key = d.classification.length > 0 ? d.classification.join(' | ') : '不明';
      byClassification.set(key, (byClassification.get(key) ?? 0) + 1);
    }

    const byFulfillment = new Map<string, number>();
    for (const d of details) {
      const key = d.fulfillment_type ?? 'null';
      byFulfillment.set(key, (byFulfillment.get(key) ?? 0) + 1);
    }

    const byOrderStatus = new Map<string, number>();
    for (const d of details) {
      const key = d.order_status ?? 'null';
      byOrderStatus.set(key, (byOrderStatus.get(key) ?? 0) + 1);
    }

    return NextResponse.json({
      ok: true,
      zeroCount: zeroRows.length,
      uniqueOrders: orderIds.length,
      byClassification: Object.fromEntries(byClassification),
      byFulfillment: Object.fromEntries(byFulfillment),
      byOrderStatus: Object.fromEntries(byOrderStatus),
      details,
      samplePayload: details[0] ? itemMap.get(`${details[0].order_id}|${details[0].order_item_id}`) : null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error)?.message ?? String(e) },
      { status: 500 }
    );
  }
}
