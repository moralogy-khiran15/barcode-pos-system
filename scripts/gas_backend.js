/**
 * Google Apps Script (GAS) コード (会計区分選択式対応版)
 * Master シート: バーコード, 商品名, 単価, 区分
 * Categories シート: 区分名（1列目に区分名を列挙）
 * Sales_xxx シート: 区分ごとに自動振り分け
 */

const SHEET_NAME_MASTER = "Master";
const SHEET_NAME_CATEGORIES = "Categories";

/**
 * データの取得 (GETリクエスト)
 * 商品マスター情報と区分一覧を返します。
 */
function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // 商品マスター取得
    const masterSheet = ss.getSheetByName(SHEET_NAME_MASTER);
    if (!masterSheet) return createJsonResponse({ error: "Master sheet not found" });
    const masterData = masterSheet.getDataRange().getValues();
    const masterRows = masterData.slice(1);
    const inventory = {};
    masterRows.forEach(row => {
      const barcode = String(row[0]);
      if (barcode) {
        inventory[barcode] = {
          name: row[1],
          price: Number(row[2]),
          category: row[3] || "未分類"
        };
      }
    });

    // 区分一覧取得
    const categories = [];
    const catSheet = ss.getSheetByName(SHEET_NAME_CATEGORIES);
    if (catSheet) {
      const catData = catSheet.getDataRange().getValues();
      const catRows = catData.slice(1); // 1行目はヘッダー
      catRows.forEach(row => {
        const catName = String(row[0]).trim();
        if (catName) {
          categories.push(catName);
        }
      });
    }

    return createJsonResponse({ inventory: inventory, categories: categories });
  } catch (err) {
    return createJsonResponse({ error: err.toString() });
  }
}

/**
 * データの書き込み (POSTリクエスト)
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. 新規商品マスタ登録
    if (data.type === 'MASTER_REGISTRATION' || data.action === 'registerProduct') {
      const sheet = ss.getSheetByName(SHEET_NAME_MASTER);
      if (!sheet) return createJsonResponse({ result: "error", message: "Master sheet not found" });
      
      // 行を追加
      sheet.appendRow([data.barcode, data.name, data.price, data.category || "未分類"]);
      
      // 書式を上の行からコピーして統一する
      var lastRow = sheet.getLastRow();
      if (lastRow > 2) {
        var sourceRange = sheet.getRange(lastRow - 1, 1, 1, 4);
        var targetRange = sheet.getRange(lastRow, 1, 1, 4);
        sourceRange.copyTo(targetRange, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
      }
      return createJsonResponse({ result: "success" });
    }
    // 2. 商品削除
    else if (data.action === 'deleteProduct') {
      const sheet = ss.getSheetByName(SHEET_NAME_MASTER);
      if (!sheet) return createJsonResponse({ result: "error", message: "Master sheet not found" });
      const masterData = sheet.getDataRange().getValues();
      for (var i = 1; i < masterData.length; i++) {
        if (String(masterData[i][0]) === String(data.barcode)) {
          sheet.deleteRow(i + 1);
          return createJsonResponse({ status: "success", result: "success" });
        }
      }
      return createJsonResponse({ result: "error", message: "Barcode not found: " + data.barcode });
    }
    // 3. 売上記録（区分ごとにシートを振り分け）
    else if (data.type === 'SALES_LOG') {
      data.items.forEach(item => {
        const category = item.category || "未分類";
        const sheetName = "Sales_" + category;
        let sheet = ss.getSheetByName(sheetName);
        if (!sheet) {
          sheet = ss.insertSheet(sheetName);
          sheet.appendRow(["日時", "バーコード", "商品名", "数量", "単価", "小計", "区分"]);
        }
        sheet.appendRow([new Date(), item.barcode, item.name, item.qty, item.price, item.qty * item.price, category]);
        
        // 書式のコピー（必要であれば）
        var lastRow = sheet.getLastRow();
        if (lastRow > 2) {
          sheet.getRange(lastRow - 1, 1, 1, 7).copyTo(sheet.getRange(lastRow, 1, 1, 7), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
        }
      });
      return createJsonResponse({ result: "success" });
    }
    else {
      return createJsonResponse({ result: "error", message: "Unknown type/action: " + (data.type || data.action) });
    }
  } catch (err) {
    return createJsonResponse({ result: "error", message: err.toString() });
  }
}

function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
