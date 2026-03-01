-- ラクマ公式送料（2025年）に合わせて送料マスタを更新
-- 出典: https://rakuma.rakuten.co.jp/assets/pdf/shipping_method_list.pdf

UPDATE shipping_rates SET base_fee_yen = 180
  WHERE platform = 'rakuma' AND display_name = 'ゆうパケット';

UPDATE shipping_rates SET base_fee_yen = 160
  WHERE platform = 'rakuma' AND display_name = 'ゆうパケットポストmini';

UPDATE shipping_rates SET base_fee_yen = 590
  WHERE platform = 'rakuma' AND display_name = '宅急便コンパクト';

UPDATE shipping_rates SET base_fee_yen = 900
  WHERE platform = 'rakuma' AND display_name = '宅急便60';

UPDATE shipping_rates SET base_fee_yen = 1000
  WHERE platform = 'rakuma' AND display_name = '宅急便80';

UPDATE shipping_rates SET base_fee_yen = 1150
  WHERE platform = 'rakuma' AND display_name = '宅急便100';

UPDATE shipping_rates SET base_fee_yen = 1350
  WHERE platform = 'rakuma' AND display_name = '宅急便120';

UPDATE shipping_rates SET base_fee_yen = 1800
  WHERE platform = 'rakuma' AND display_name = '宅急便140';

UPDATE shipping_rates SET base_fee_yen = 2000
  WHERE platform = 'rakuma' AND display_name = '宅急便160';
