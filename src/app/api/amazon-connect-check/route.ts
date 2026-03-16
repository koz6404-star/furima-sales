/**
 * Amazon 接続確認エンドポイント（Phase 1）
 * Orders API の疎通確認を行う
 *
 * GET: 認証済みユーザーのみ。Orders API で直近7日分の注文を1件取得して疎通確認
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getOrders } from '@/lib/amazon/orders';
import { normalizeAmazonError } from '@/lib/amazon/errors';

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

    const createdAfter = new Date(Date.now() - 7 * 864e5);

    const result = await getOrders({
      createdAfter,
      maxResultsPerPage: 5,
    });

    const orders = result.Orders ?? [];
    const ordersCount = orders.length;

    return NextResponse.json({
      ok: true,
      phase: 1,
      message: 'Orders API 疎通確認成功',
      ordersCount,
      sampleOrder: orders[0]
        ? {
            AmazonOrderId: orders[0].AmazonOrderId,
            PurchaseDate: orders[0].PurchaseDate,
            OrderStatus: orders[0].OrderStatus,
            FulfillmentChannel: orders[0].FulfillmentChannel,
          }
        : null,
      note: ordersCount === 0
        ? '直近7日に注文がありません。接続は成功しています。'
        : undefined,
    });
  } catch (e) {
    const normalized = normalizeAmazonError(e);
    const statusCode =
      normalized.code === 'UNAUTHORIZED'
        ? 401
        : normalized.code === 'FORBIDDEN' || normalized.code === 'CREDENTIALS_MISSING'
          ? 403
          : 500;

    return NextResponse.json(
      {
        ok: false,
        phase: 1,
        error: normalized.message,
        code: normalized.code,
        details: normalized.details,
      },
      { status: statusCode }
    );
  }
}
