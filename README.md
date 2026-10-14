# 臺中即時地磁停車格地圖

Express + Leaflet，使用臺中市政府路邊停車資料。支援 Render Docker 部署。

## 部署
在 Render Dashboard 選 New → Blueprint，連結此 GitHub 儲存庫並套用 render.yaml。

## 檢查
部署後開啟 /api/parking，確認 meta.fresh 為 true 且 recordCount 大於 0。
資料端點尚未實際驗證，若上游失效，網站會顯示資料異常而不會假造即時空位。

## 環境變數
PARKING_SOURCE_URL、REFRESH_SECONDS（預設 600）、MAX_STALE_SECONDS（預設 1800）。

資料來源：https://data.gov.tw/dataset/158166
