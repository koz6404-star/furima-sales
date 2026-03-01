-- ラクマ送料を公式料金に強制更新（013で更新漏れがあった場合のリカバリ）
-- 出典: https://rakuma.rakuten.co.jp/assets/pdf/shipping_method_list.pdf（かんたんラクマパック）

UPDATE shipping_rates SET base_fee_yen = 180
  WHERE platform = 'rakuma' AND display_name = 'ゆうパケット';

UPDATE shipping_rates SET base_fee_yen = 175
  WHERE platform = 'rakuma' AND display_name = 'ゆうパケットポスト';

UPDATE shipping_rates SET base_fee_yen = 160
  WHERE platform = 'rakuma' AND display_name = 'ゆうパケットポストmini';

UPDATE shipping_rates SET base_fee_yen = 380
  WHERE platform = 'rakuma' AND display_name = 'ゆうパケットプラス';

UPDATE shipping_rates SET base_fee_yen = 200
  WHERE platform = 'rakuma' AND display_name = 'ネコポス';

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

UPDATE shipping_rates SET base_fee_yen = 700
  WHERE platform = 'rakuma' AND display_name = 'ゆうパック60';

UPDATE shipping_rates SET base_fee_yen = 800
  WHERE platform = 'rakuma' AND display_name = 'ゆうパック80';

UPDATE shipping_rates SET base_fee_yen = 1150
  WHERE platform = 'rakuma' AND display_name = 'ゆうパック100';

UPDATE shipping_rates SET base_fee_yen = 1350
  WHERE platform = 'rakuma' AND display_name = 'ゆうパック120';

UPDATE shipping_rates SET base_fee_yen = 1500
  WHERE platform = 'rakuma' AND display_name = 'ゆうパック140';

UPDATE shipping_rates SET base_fee_yen = 1500
  WHERE platform = 'rakuma' AND display_name = 'ゆうパック160';

UPDATE shipping_rates SET base_fee_yen = 1500
  WHERE platform = 'rakuma' AND display_name = 'ゆうパック170';
