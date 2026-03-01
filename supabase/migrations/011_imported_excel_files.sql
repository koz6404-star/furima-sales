-- 取り込み済みExcelファイルの記録（同一ファイルの重複取り込み警告用）
CREATE TABLE IF NOT EXISTS imported_excel_files (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_hash TEXT NOT NULL,
  file_name TEXT,
  imported_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, file_hash)
);

CREATE INDEX idx_imported_excel_files_user ON imported_excel_files(user_id);

ALTER TABLE imported_excel_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "imported_excel_files_all" ON imported_excel_files FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
