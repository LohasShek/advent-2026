# 將臨期情感讀經 2026

手機優先的靜態網頁，給香港教會在將臨期（2026年11月29日至12月25日）用。每日約 13 分鐘：安靜、留意感受、讀經、反思、祈禱。

感受、筆記和反思只存在使用者自己的裝置，沒有帳號。

網站會放在 [https://lohasshek.github.io/advent-2026/](https://lohasshek.github.io/advent-2026/)。

## 本地預覽

在專案根目錄：

```bash
python3 -m http.server 8080
```

然後用手機或瀏覽器的裝置模式打開 `http://127.0.0.1:8080/`。不要直接用檔案路徑打開，否則讀不到 JSON。

想預覽某一日「今天」是哪一天（香港時間以外），網址加上 `?asof=2026-12-06`。季節前會看到倒數，季節中會直接進入當日，12月25日之後會看到整份 27 日計劃。

檢查日期和資料：

```bash
python3 scripts/convert_csv.py
node scripts/test_logic.mjs
```

## 更新經文或引導

來源是 `content/` 裏三份 UTF-8（帶 BOM）的 CSV：

- `將臨期每日經文_v2.csv`：日期、標題、出處，以及 `經文全文（神版）`、`經文全文（上帝版）`。一行一節，行首是節號。
- `將臨期每日情感引導_v2.csv`：開場禱文、兩條反思、示範禱文、回顧日提示。
- `感受之輪詞彙_v2.csv`：六種核心情緒、細分感受、強度，以及關懷提示。

改完 CSV 之後執行：

```bash
python3 scripts/convert_csv.py
```

這會重寫 `data/plan.json` 和 `data/feelings.json`。程式不會自己上網找經文，也不會編造經文。若某一日的經文全文是空的，畫面只顯示出處和一句請自行翻開聖經的提示。

預設顯示神版。讀者可以在「關於」頁改為上帝版，選擇存在該部裝置。

## GoatCounter 和教會聯絡

打開 `config.js`：

- `goatcounter`：填 GoatCounter 的網站代碼，例如 `my-church`（即 `my-church.goatcounter.com`）。留空代表完全不載入統計、不送出任何數字。若填的是完整網址（以 `https://` 開頭），就會直接用那個計數網址。
- `churchContact`：關懷提示裏的聯絡句子。執行轉換腳本時，會依詞彙 CSV 的關懷提示覆寫這一行。目前是「歡迎聯絡石守賢傳道」。

統計開啟之後，只計算有人打開頁面，以及有人按下「完成今日讀經」。另外，「關於」頁有一個預設關閉的開關「匿名分享我今日嘅感受」。打開並完成當日之後，才會送出日序、讀經前後的核心情緒、細分感受和強度。不會送出「因為……」、反思，或任何身分。

## 發佈到 GitHub Pages

`.github/workflows/pages.yml` 會在 `main` 被推送時，重新轉換 CSV、跑測試，然後用 GitHub Actions 部署。

倉庫的 Pages 來源必須在 GitHub 設定裏改為 **GitHub Actions**（Settings → Pages → Build and deployment → Source）。只選分支部署的話，這個 workflow 不會把網站發佈出去。

## 離線

網站可以加到主畫面。Service worker 會把頁面和圖檔留在裝置上，沒有網絡時仍可打開讀過的內容。
