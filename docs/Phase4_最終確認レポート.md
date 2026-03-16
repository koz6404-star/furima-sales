# Phase4 最終確認レポート

※ 集計単位の詳細は `Phase4_集計単位の説明.md` を参照

## 確認方法

**アプリ起動後、ログイン状態で以下を実行してください。**

### 1. 現状サマリー（GET）

```
GET http://localhost:3000/api/amazon-phase4-verify
```

ブラウザで開く: `http://localhost:3000/api/amazon-phase4-verify`

### 2. 再transform + 前後比較（POST）

```
POST http://localhost:3000/api/amazon-phase4-verify
```

- 同じ raw データに対し transform を 2 回実行
- 1回目と2回目で件数が一致するか（安定性）を確認
- confirmed & null 件数が 0 か確認

※ curl 例: `curl -X POST http://localhost:3000/api/amazon-phase4-verify -b "cookie..."`  
※ または開発者ツールの Console から: `fetch('/api/amazon-phase4-verify', { method: 'POST' }).then(r => r.json()).then(console.log)`

---

## 集計対象条件の確認結果（コードレビュー）

| 対象 | 条件 | 結果 |
|------|------|------|
| **一覧取得 API** | `salesState` パラメータ、省略時 = `confirmed` | ✅ デフォルト confirmed |
| **一覧画面** | `salesStateParam = searchParams.get('salesState') ?? 'confirmed'` | ✅ 初期表示は confirmed のみ |
| **サマリー表示** | 全 state の件数表示（確認用） | ✅ 集計には含めず、件数のみ表示 |
| **売上合計** | Phase4 時点では集計APIなし | ✅ 一覧の行表示のみ。Phase5 で追加時は `WHERE sales_state = 'confirmed'` で絞る必要あり |

**pending_price / canceled / other_excluded が売上に混ざらないか**

- 一覧取得: `salesState !== 'all'` のとき `query.eq('sales_state', salesState)` でフィルタ
- デフォルト `salesState = 'confirmed'` のため、初期表示・パラメータ省略時は confirmed のみ
- サマリーは件数表示のみで、金額合計は行っていない
- **結論**: 現状は誤って混ざる経路なし ✅

---

## 判定基準

| 項目 | 合格条件 |
|------|----------|
| confirmed & null 件数 | 0 件 |
| 再transform 安定性 | 2回実行で件数・state別件数が一致 |
| 集計対象 | 一覧・集計が confirmed のみ参照 |
| 他 state 混入 | pending_price / canceled / other_excluded が売上合計に含まれない |

---

## 出力例（POST 成功時）

```json
{
  "ok": true,
  "passed": true,
  "before": { "confirmed": 10, "pending_price": 2, "canceled": 1, "other_excluded": 0, "total": 13, "confirmedNullAmount": 0 },
  "after1": { "confirmed": 10, "pending_price": 2, "canceled": 1, "other_excluded": 0, "total": 13, "confirmedNullAmount": 0 },
  "after2": { "confirmed": 10, "pending_price": 2, "canceled": 1, "other_excluded": 0, "total": 13, "confirmedNullAmount": 0 },
  "stable": "同じrawで2回transform→件数一致（安定）",
  "verdict": "合格: Phase5 へ進んでよい"
}
```

---

## Phase5 進出可否

**POST /api/amazon-phase4-verify の `passed: true` かつ `verdict: "合格: Phase5 へ進んでよい"` であれば Phase5 に進んでください。**
