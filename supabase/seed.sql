-- フリマ売上管理アプリ 初期マスタ（全部入り）

-- (1) 販売手数料 初期値
INSERT INTO fee_rates (platform, display_name, rate_percent, rakuma_rank) VALUES
  ('mercari', 'メルカリ（10%固定）', 10, NULL),
  ('rakuma', 'ラクマ 10%', 10, 1),
  ('rakuma', 'ラクマ 9%', 9, 2),
  ('rakuma', 'ラクマ 8%', 8, 3),
  ('rakuma', 'ラクマ 7%', 7, 4),
  ('rakuma', 'ラクマ 6%', 6, 5),
  ('rakuma', 'ラクマ 4.5%', 4.5, 6);

-- (2) 送料マスタ 初期値

-- メルカリ：らくらくメルカリ便・ゆうゆうメルカリ便等
INSERT INTO shipping_rates (platform, display_name, base_fee_yen, size_label) VALUES
  ('mercari', 'ネコポス', 210, NULL),
  ('mercari', '宅急便コンパクト', 450, NULL),
  ('mercari', '宅急便60', 750, '60'),
  ('mercari', '宅急便80', 950, '80'),
  ('mercari', '宅急便100', 1150, '100'),
  ('mercari', '宅急便120', 1350, '120'),
  ('mercari', '宅急便140', 1500, '140'),
  ('mercari', '宅急便160', 1700, '160'),
  ('mercari', 'ゆうパケットポストmini', 160, NULL),
  ('mercari', 'ゆうパケット', 230, NULL),
  ('mercari', 'ゆうパケットポスト', 220, NULL),
  ('mercari', 'ゆうパケットプラス', 455, NULL),
  ('mercari', 'ゆうパック60', 770, '60'),
  ('mercari', 'ゆうパック80', 900, '80'),
  ('mercari', 'ゆうパック100', 1200, '100'),
  ('mercari', 'ゆうパック120', 1400, '120'),
  ('mercari', 'たのメル便', 180, NULL),
  ('mercari', 'エコメルカリ便', 230, NULL),
  ('mercari', '定形郵便', 94, NULL),
  ('mercari', '定形外郵便', 120, NULL),
  ('mercari', 'レターパックライト', 370, NULL),
  ('mercari', 'レターパックプラス', 520, NULL),
  ('mercari', 'クリックポスト', 198, NULL),
  ('mercari', 'スマートレター', 180, NULL);

-- ラクマ：かんたんラクマパック
-- 日本郵便
INSERT INTO shipping_rates (platform, display_name, base_fee_yen, size_label) VALUES
  ('rakuma', 'ゆうパケット', 200, NULL),
  ('rakuma', 'ゆうパケットポスト', 175, NULL),
  ('rakuma', 'ゆうパケットポストmini', 150, NULL),
  ('rakuma', 'ゆうパケットプラス', 380, NULL),
  ('rakuma', 'ゆうパック60', 700, '60'),
  ('rakuma', 'ゆうパック80', 800, '80'),
  ('rakuma', 'ゆうパック100', 1150, '100'),
  ('rakuma', 'ゆうパック120', 1350, '120'),
  ('rakuma', 'ゆうパック140', 1500, '140'),
  ('rakuma', 'ゆうパック160', 1500, '160'),
  ('rakuma', 'ゆうパック170', 1500, '170');
-- ヤマト
INSERT INTO shipping_rates (platform, display_name, base_fee_yen, size_label) VALUES
  ('rakuma', 'ネコポス', 200, NULL),
  ('rakuma', '宅急便コンパクト', 430, NULL),
  ('rakuma', '宅急便60', 650, '60'),
  ('rakuma', '宅急便80', 750, '80'),
  ('rakuma', '宅急便100', 1050, '100'),
  ('rakuma', '宅急便120', 1200, '120'),
  ('rakuma', '宅急便140', 1400, '140'),
  ('rakuma', '宅急便160', 1500, '160'),
  ('rakuma', '宅急便180', 2800, '180'),
  ('rakuma', '宅急便200', 3350, '200');

-- 自由入力（その他）
INSERT INTO shipping_rates (platform, display_name, base_fee_yen, is_custom) VALUES
  ('mercari', 'その他（自由入力）', 0, true),
  ('rakuma', 'その他（自由入力）', 0, true);

-- (3) 資材代マスタ
INSERT INTO material_fees (platform, display_name, fee_yen) VALUES
  ('mercari', '宅急便コンパクト専用BOX', 70),
  ('mercari', 'ゆうパケットポスト専用箱', 65),
  ('mercari', 'ゆうパケットポストmini封筒', 20),
  ('mercari', 'ゆうパケットプラス専用箱', 65),
  ('rakuma', '宅急便コンパクト専用資材', 70),
  ('rakuma', 'ゆうパケットポスト専用箱', 65),
  ('rakuma', 'ゆうパケットポストmini封筒', 20),
  ('rakuma', 'ゆうパケットプラス専用箱', 65);
