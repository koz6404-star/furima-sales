#!/usr/bin/env node
/**
 * Amazon SP-API リフレッシュトークン取得ヘルパー
 *
 * 使い方:
 * 1. SPPでアプリを作成し、LWAクライアントID・シークレットを取得
 * 2. 下記の認証URLをブラウザで開き、リダイレクト先URLから spapi_oauth_code をコピー
 * 3. このスクリプトを実行:
 *    node scripts/get-amazon-refresh-token.mjs <CLIENT_ID> <CLIENT_SECRET> <spapi_oauth_code>
 *
 * 例:
 *    node scripts/get-amazon-refresh-token.mjs amzn1.application-oa2-client.xxxx amzn1.oa2-cs.v1.xxxx ANxxxxxxxx...
 */

const [clientId, clientSecret, code] = process.argv.slice(2);

if (!clientId || !clientSecret || !code) {
  console.log(`
Amazon SP-API リフレッシュトークン取得

【ステップ1】認証URLをブラウザで開く（LWAクライアントIDを置換）:
  https://sellercentral.amazon.co.jp/apps/authorize/consent?application_id=YOUR_CLIENT_ID&state=state123&version=beta

【ステップ2】ログインして同意後、リダイレクト先URLをコピーする
  「許可されていない」と出ても、アドレスバーのURLに spapi_oauth_code= が含まれています

【ステップ3】このスクリプトを実行:
  node scripts/get-amazon-refresh-token.mjs <CLIENT_ID> <CLIENT_SECRET> <spapi_oauth_code>
`);
  process.exit(1);
}

async function main() {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code: code.trim(),
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch('https://api.amazon.co.jp/auth/o2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('エラー:', data.error_description || data.error || data);
    process.exit(1);
  }

  console.log('\n✅ リフレッシュトークンを取得しました\n');
  console.log('AMAZON_REFRESH_TOKEN=', data.refresh_token);
  console.log('\n.env.local に以下を追加してください:');
  console.log('---');
  console.log(`SELLING_PARTNER_APP_CLIENT_ID=${clientId}`);
  console.log(`SELLING_PARTNER_APP_CLIENT_SECRET=${clientSecret}`);
  console.log(`AMAZON_REFRESH_TOKEN=${data.refresh_token}`);
  console.log('---\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
