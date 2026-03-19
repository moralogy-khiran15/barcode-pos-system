import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Barcode,
  RotateCcw,
  Keyboard,
  List,
  ShoppingCart,
  Minus,
  Plus,
  Trash2,
  ScanLine,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Tag
} from 'lucide-react';

// GAS URL
const GAS_URL = "https://script.google.com/macros/s/AKfycbxe2SAFg4rhJxwSqomci_Z1qW3TD7cij9_nOu5hUu3BjEdyn1j9nHdxhoCQ8Lj4-737/exec";

// フォールバック用の初期マスターデータ
const INITIAL_INVENTORY = {
  "4901777189158": { name: "サントリー 天然水 550ml", price: 110 },
  "4902102072618": { name: "コカ・コーラ 500ml", price: 160 },
  "4901330010034": { name: "カルビー ポテトチップス", price: 150 },
  "4901085189280": { name: "お〜いお茶 600ml", price: 140 },
};

export default function App() {
  // --- States ---
  const [inventory, setInventory] = useState(INITIAL_INVENTORY);
  const [scannedItems, setScannedItems] = useState([]); // { barcode, qty } の配列

  const [manualCode, setManualCode] = useState('');

  const [registeringBarcode, setRegisteringBarcode] = useState(null);
  const [newProduct, setNewProduct] = useState({ name: '', price: '', category: '' });

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastMessage, setLastMessage] = useState({ type: '', text: '' });
  const [categories, setCategories] = useState([]);

  // 連続読み取り防止用のRef
  const lastScanTime = useRef(0);
  const lastScannedCode = useRef('');
  // 最新のStateをイベントリスナー内で参照するためのRef
  const registeringBarcodeRef = useRef(null);
  const inventoryRef = useRef(inventory);
  const isProcessingRef = useRef(false);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    inventoryRef.current = inventory;
  }, [inventory]);

  // --- Effects ---
  // 起動時にデータを復元 & GASからマスター取得
  useEffect(() => {
    // 1. まずローカルストレージから復元
    const savedInventory = localStorage.getItem('POS_INVENTORY');
    if (savedInventory) setInventory(JSON.parse(savedInventory));

    const savedItems = localStorage.getItem('POS_SCANNED_ITEMS');
    if (savedItems) setScannedItems(JSON.parse(savedItems));

    const savedCategories = localStorage.getItem('POS_CATEGORIES');
    if (savedCategories) setCategories(JSON.parse(savedCategories));

    // 2. GASから最新のマスターデータを取得
    fetchInventoryFromGAS();
  }, []);

  const fetchInventoryFromGAS = async () => {
    setIsLoading(true);
    try {
      // GASの公開URLへアクセス（リダイレクト対応が必要な場合があるが fetch はデフォルトで追従する）
      const response = await fetch(GAS_URL);
      const data = await response.json();
      
      if (data && !data.error) {
        // 新形式: { inventory, categories }
        if (data.inventory) {
          setInventory(data.inventory);
          localStorage.setItem('POS_INVENTORY', JSON.stringify(data.inventory));
        } else {
          // 旧形式互換
          setInventory(data);
          localStorage.setItem('POS_INVENTORY', JSON.stringify(data));
        }
        if (data.categories) {
          setCategories(data.categories);
          localStorage.setItem('POS_CATEGORIES', JSON.stringify(data.categories));
        }
        setLastMessage({ type: 'success', text: 'マスターデータを読み込みました' });
      } else {
        setLastMessage({ type: 'error', text: 'マスターの読み込みに失敗しました' });
      }
    } catch (err) {
      console.error("GAS Fetch Error:", err);
      setLastMessage({ type: 'error', text: 'GAS 接続エラー' });
    } finally {
      setIsLoading(false);
      // 3秒後にメッセージを消す
      setTimeout(() => setLastMessage({ type: '', text: '' }), 3000);
    }
  };

  // スキャン履歴変更時にローカルストレージへ保存
  useEffect(() => {
    localStorage.setItem('POS_SCANNED_ITEMS', JSON.stringify(scannedItems));
  }, [scannedItems]);

  useEffect(() => {
    registeringBarcodeRef.current = registeringBarcode;
  }, [registeringBarcode]);


  // ピッという音を鳴らす関数
  const playBeep = useCallback(() => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(1200, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.05, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch (e) {
      console.error("Audio playback failed", e);
    }
  }, []);

  // スキャン成功時の処理本体
  const onNewScanResult = useCallback((decodedText) => {
    // 処理中（GAS通信中など）はスキャンを無視する
    if (isProcessingRef.current || isSubmittingRef.current) return;

    const now = Date.now();
    // 3秒以内の同じバーコードの連続読み取りを防止（チャタリング対策）
    if (now - lastScanTime.current < 3000 && lastScannedCode.current === decodedText) {
      return;
    }

    lastScanTime.current = now;
    lastScannedCode.current = decodedText;
    playBeep();

    // 最新の在庫情報を参照
    const currentInventory = inventoryRef.current;

    if (currentInventory[decodedText]) {
      // マスターに存在する場合：カートに追加・数量アップ
      setScannedItems(prevItems => {
        const existing = prevItems.find(item => item.barcode === decodedText);
        if (existing) {
          return prevItems.map(item =>
            item.barcode === decodedText ? { ...item, qty: item.qty + 1 } : item
          );
        } else {
          return [{ barcode: decodedText, qty: 1 }, ...prevItems]; // 先頭に追加
        }
      });
    } else {
      // マスターに存在しない場合：新規登録モーダルを表示
      setRegisteringBarcode(decodedText);
      setNewProduct({ name: '', price: '', category: '' });
    }
  }, [playBeep]);


  // --- 専用バーコードリーダー（キーボードエミュレーション）対応 ---
  useEffect(() => {
    let barcodeBuffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e) => {
      // 入力中やモーダル表示中、GAS通信中はスキップ
      const activeTag = document.activeElement.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || registeringBarcodeRef.current || isSubmittingRef.current || isProcessingRef.current) {
        return;
      }

      const currentTime = Date.now();

      // 50ms以上間隔が空いた場合は、人間のタイピングとみなしてバッファをリセット
      if (currentTime - lastKeyTime > 50) {
        barcodeBuffer = '';
      }
      lastKeyTime = currentTime;

      if (e.key === 'Enter') {
        if (barcodeBuffer.length > 0) {
          e.preventDefault();
          // 空白を削除して実行
          onNewScanResult(barcodeBuffer.trim().replace(/\s+/g, ''));
          barcodeBuffer = '';
        }
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        barcodeBuffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNewScanResult]);


  // --- Handlers ---
  const handleManualAdd = (e) => {
    e.preventDefault();
    if (!manualCode.trim() || isSubmitting) return;
    onNewScanResult(manualCode.trim());
    setManualCode('');
    document.activeElement.blur();
  };

  // 新規商品を登録（GASにも送信）
  const handleRegisterNewProduct = async () => {
    const code = registeringBarcode;
    const price = parseInt(newProduct.price, 10);
    if (!code || isNaN(price) || !newProduct.name || isSubmitting) return;

    setIsSubmitting(true);
    isSubmittingRef.current = true;
    isProcessingRef.current = true;
    try {
      // 1. GASへ送信
      const response = await fetch(GAS_URL, {
        method: 'POST',
        body: JSON.stringify({
          type: 'MASTER_REGISTRATION',
          barcode: code,
          name: newProduct.name,
          price: price,
          category: newProduct.category || '未分類'
        })
      });
      
      const result = await response.json();
      
      if (result.result === 'success') {
        // 2. ローカルの状態も更新
        setInventory(prev => ({
          ...prev,
          [code]: { name: newProduct.name, price: price, category: newProduct.category || '未分類' }
        }));
        setScannedItems(prev => [{ barcode: code, qty: 1 }, ...prev]);
        setRegisteringBarcode(null);
        setLastMessage({ type: 'success', text: 'スプレッドシートに商品を登録しました' });
      } else {
        throw new Error(result.message || 'GAS側の書き込みに失敗しました');
      }
    } catch (err) {
      setLastMessage({ type: 'error', text: `登録エラー: ${err.message}` });
    } finally {
      setIsSubmitting(false);
      isSubmittingRef.current = false;
      isProcessingRef.current = false;
      setTimeout(() => setLastMessage({ type: '', text: '' }), 3000);
    }
  };

  // お会計確定（スプレッドシートへ送信）
  const handleCheckout = async () => {
    if (scannedItems.length === 0 || isSubmitting) return;
    if (!window.confirm('お会計を確定してスプレッドシートに記録しますか？')) return;

    setIsSubmitting(true);
    isSubmittingRef.current = true;
    isProcessingRef.current = true;
    try {
      // 送信データの作成
      const itemsToPost = scannedItems.map(item => ({
        barcode: item.barcode,
        name: inventory[item.barcode]?.name || '不明',
        qty: item.qty,
        price: inventory[item.barcode]?.price || 0,
        category: inventory[item.barcode]?.category || '未分類'
      }));

      const response = await fetch(GAS_URL, {
        method: 'POST',
        body: JSON.stringify({
          type: 'SALES_LOG',
          items: itemsToPost
        })
      });

      const result = await response.json();
      if (result.result === 'success') {
        setScannedItems([]);
        setLastMessage({ type: 'success', text: '売上をスプレッドシートに記録しました' });
      } else {
        throw new Error(result.message);
      }
    } catch (err) {
      console.error(err);
      setLastMessage({ type: 'error', text: `記録エラー: ${err.message}` });
    } finally {
      setIsSubmitting(false);
      isSubmittingRef.current = false;
      isProcessingRef.current = false;
      setTimeout(() => setLastMessage({ type: '', text: '' }), 3000);
    }
  };

  const updateQty = (barcode, delta) => {
    if (isSubmitting) return;
    setScannedItems(prev => {
      return prev.map(item => {
        if (item.barcode === barcode) {
          const newQty = item.qty + delta;
          return newQty > 0 ? { ...item, qty: newQty } : item;
        }
        return item;
      });
    });
  };

  const removeItem = (barcode) => {
    if (isSubmitting) return;
    if (window.confirm('この商品をリストから削除しますか？')) {
      setScannedItems(prev => prev.filter(item => item.barcode !== barcode));
    }
  };

  const clearCart = () => {
    if (scannedItems.length === 0 || isSubmitting) return;
    if (window.confirm('スキャン履歴をすべてリセットしますか？')) {
      setScannedItems([]);
    }
  };

  // --- Calculations ---
  const totalQty = scannedItems.reduce((sum, item) => sum + item.qty, 0);
  const totalPrice = scannedItems.reduce((sum, item) => {
    const productPrice = inventory[item.barcode]?.price || 0;
    return sum + (productPrice * item.qty);
  }, 0);


  return (
    <div className="min-h-screen bg-slate-50 pb-32 font-sans text-slate-800 selection:bg-indigo-100">
      {/* ヘッダー */}
      <header className="bg-slate-900 text-white p-4 sticky top-0 z-10 flex justify-between items-center shadow-md">
        <div className="flex items-center gap-2">
          <ScanLine className="w-6 h-6 text-indigo-400" />
          <h1 className="font-bold text-lg tracking-wide">部内用スプレッドシート連携レジ</h1>
        </div>
        <div className="flex items-center gap-3">
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
          ) : (
            <button onClick={fetchInventoryFromGAS} className="text-xs text-slate-400 hover:text-white transition">
              同期
            </button>
          )}
          <button
            onClick={clearCart}
            disabled={scannedItems.length === 0}
            className="text-sm bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-full flex items-center gap-1.5 hover:bg-slate-700 transition disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" />
            リセット
          </button>
        </div>
      </header>

      {/* 通知メッセージ */}
      {lastMessage.text && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-full shadow-2xl flex items-center gap-2 animate-in slide-in-from-top-4 duration-300 ${
          lastMessage.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {lastMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <span className="font-bold text-sm">{lastMessage.text}</span>
        </div>
      )}

      <main className="max-w-3xl mx-auto mt-4">

        {/* リーダー待機状態の表示 */}
        <div className="mx-4 mb-4 bg-indigo-50 border-2 border-indigo-200 border-dashed rounded-2xl p-6 text-center shadow-sm">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 rounded-full mb-3 text-indigo-600 animate-pulse">
            <Barcode className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-1">スキャン待機中...</h2>
          <p className="text-slate-600 text-sm">
            お手元のバーコードリーダー（Tera D5100など）で<br className="sm:hidden" />
            商品のバーコードを読み取ってください。<br />
            <span className="text-xs text-slate-500 mt-2 inline-block">※画面のどこをクリックしていても反応します</span>
          </p>
        </div>

        {/* 集計サマリー */}
        <div className="mx-4 mb-6 p-5 bg-white rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-full -mr-10 -mt-10 opacity-50 pointer-events-none"></div>

          <div className="relative z-10">
            <p className="text-slate-500 text-sm font-bold mb-1">合計数量</p>
            <p className="text-3xl font-black text-slate-800">
              {totalQty} <span className="text-base font-bold text-slate-400">点</span>
            </p>
          </div>

          <div className="h-12 w-px bg-slate-200 relative z-10"></div>

          <div className="text-right relative z-10">
            <p className="text-slate-500 text-sm font-bold mb-1">売上合計 (税込)</p>
            <p className="text-4xl font-black text-indigo-600 tracking-tight drop-shadow-sm">
              <span className="text-2xl mr-1">¥</span>{totalPrice.toLocaleString()}
            </p>
          </div>
        </div>

        {/* スキャン履歴リスト */}
        <div className="mx-4 mb-6">
          <h2 className="font-bold text-slate-700 mb-3 px-1 flex items-center gap-2">
            <List className="w-5 h-5 text-indigo-500" /> スキャン履歴・一覧
          </h2>

          {scannedItems.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center border border-slate-200 shadow-sm">
              <ShoppingCart className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-500 font-medium">まだ商品がありません</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 divide-y divide-slate-100 overflow-hidden">
              {scannedItems.map((item) => {
                const product = inventory[item.barcode];
                const itemTotal = (product?.price || 0) * item.qty;

                return (
                  <div key={item.barcode} className="p-4 flex items-center gap-3 hover:bg-slate-50 transition">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-slate-800 truncate text-base">
                        {product?.name || '不明な商品'}
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-1 font-mono">
                        <Barcode className="w-3 h-3" />
                        <span>{item.barcode}</span>
                        <span className="text-slate-300">|</span>
                        <span>@ ¥{product?.price?.toLocaleString() || 0}</span>
                      </div>
                      {product?.category && (
                        <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 bg-indigo-50 text-indigo-600 text-xs font-bold rounded-full border border-indigo-100">
                          <Tag className="w-3 h-3" />{product.category}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <p className="font-black text-slate-800">
                        ¥{itemTotal.toLocaleString()}
                      </p>
                      <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-lg p-0.5">
                        <button
                          onClick={() => updateQty(item.barcode, -1)}
                          className="p-1.5 hover:bg-white rounded-md text-slate-600 transition shadow-sm"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-8 text-center text-sm font-bold text-slate-700">{item.qty}</span>
                        <button
                          onClick={() => updateQty(item.barcode, 1)}
                          className="p-1.5 hover:bg-white rounded-md text-slate-600 transition shadow-sm"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="pl-3 border-l border-slate-100 ml-2">
                      <button
                        onClick={() => removeItem(item.barcode)}
                        className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 手動入力領域（バーコードがかすれている時用） */}
        <div className="mx-4 mb-10 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <h2 className="font-medium text-slate-600 mb-3 text-sm flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-slate-400" /> リーダーで読めない場合は手動入力
          </h2>
          <form onSubmit={handleManualAdd} className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="バーコード番号を入力"
              className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition"
              disabled={isSubmitting}
            />
            <button
              type="submit"
              disabled={!manualCode.trim() || isSubmitting}
              className="bg-slate-800 text-white px-5 py-2 rounded-lg text-sm font-bold hover:bg-slate-700 transition disabled:opacity-50"
            >
              追加
            </button>
          </form>
        </div>

      </main>

      {/* 固定フッター：確定ボタン */}
      <footer className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-slate-200 z-20">
        <div className="max-w-3xl mx-auto">
          <button
            onClick={handleCheckout}
            disabled={scannedItems.length === 0 || isSubmitting}
            className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black text-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-[0.98] transition disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-3"
          >
            {isSubmitting ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <CheckCircle2 className="w-6 h-6" />
            )}
            {isSubmitting ? '記録中...' : 'お会計 確定（シートに保存）'}
          </button>
        </div>
      </footer>

      {/* 新規商品登録モーダル */}
      {registeringBarcode && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="mb-5">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded mb-2 border border-amber-200">
                <ScanLine className="w-3 h-3" /> 未登録バーコード
              </span>
              <h3 className="text-xl font-bold text-slate-800">新しい商品を登録</h3>
              <p className="text-sm text-slate-500 mt-2 font-mono bg-slate-50 p-2.5 rounded-lg border border-slate-200 flex items-center gap-2">
                <Barcode className="w-4 h-4 text-slate-400" /> {registeringBarcode}
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">商品名</label>
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition"
                  value={newProduct.name}
                  onChange={e => setNewProduct({ ...newProduct, name: e.target.value })}
                  placeholder="例: 伊藤園 お〜いお茶 500ml"
                  autoFocus
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">販売単価 (税込)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">¥</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 pl-8 focus:outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition font-bold text-lg"
                    value={newProduct.price}
                    onChange={e => setNewProduct({ ...newProduct, price: e.target.value })}
                    placeholder="150"
                    disabled={isSubmitting}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">会計区分</label>
                <select
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition font-bold"
                  value={newProduct.category}
                  onChange={e => setNewProduct({ ...newProduct, category: e.target.value })}
                  disabled={isSubmitting}
                >
                  <option value="">― 区分を選択してください ―</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-8 flex gap-3">
              <button
                className="flex-1 px-4 py-3 bg-white border-2 border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition"
                onClick={() => setRegisteringBarcode(null)}
                disabled={isSubmitting}
              >
                キャンセル
              </button>
              <button
                className="flex-1 px-4 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-indigo-200"
                disabled={!newProduct.name || !newProduct.price || !newProduct.category || isSubmitting}
                onClick={handleRegisterNewProduct}
              >
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : '登録して追加'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
