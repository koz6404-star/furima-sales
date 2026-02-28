import { test, expect } from '@playwright/test';

test.describe('フリマ売上管理アプリ', () => {
  test('ログインページが表示される', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('h1')).toContainText('ログイン');
    await expect(page.getByLabel(/メールアドレス/)).toBeVisible();
    await expect(page.getByLabel(/パスワード/)).toBeVisible();
  });

  test('未認証で商品一覧へアクセスするとログインにリダイレクト', async ({ page }) => {
    await page.goto('/products');
    await expect(page).toHaveURL(/\/login/);
  });

  test('新規登録ページが表示される', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.locator('h1')).toContainText('新規登録');
  });
});
