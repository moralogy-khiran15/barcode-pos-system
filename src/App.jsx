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
  Tag,
  ChevronRight,
  RefreshCw,
  Zap,
  Settings
} from 'lucide-react';

// GAS URL
const GAS_URL = "https://script.google.com/macros/s/AKfycby97BIS4lu_3czcKqSBBxuI9Zo3GEm12pVo-owQ0oRpCBTY9aRHIWLKMFNb_PomwfLf/exec";
const ADMIN_TAB = "⚙ 管理設定";

// フォールバック用の初期マスターデータ
const INITIAL_INVENTORY = {};

// バーコードなし商品の設定 (クイック選択用)
const QUICK_ITEMS = {
  "出版部　委託": [
    { barcode: "PUB-001", name: "書籍『品性をつくる人間学』", price: 4400 },
    { barcode: "PUB-002", name: "書籍『モラロジー概論』", price: 1100 },
    { barcode: "PUB-003", name: "書籍『最高道徳の格言』", price: 800 },
    { barcode: "PUB-004", name: "書籍『教訓抄』", price: 1000 },
    { barcode: "PUB-005", name: "書籍『回顧録』", price: 1620 },
    { barcode: "PUB-006", name: "心を育てるかるた", price: 1500 },
    { barcode: "PUB-007", name: "ピンバッチ", price: 550 },
    { barcode: "PUB-008", name: "缶バッジ（A）", price: 220 },
    { barcode: "PUB-009", name: "缶バッジ（B）", price: 220 },
    { barcode: "PUB-010", name: "缶バッジ（C）", price: 220 },
    { barcode: "PUB-011", name: "缶バッジ（D）", price: 220 },
    { barcode: "PUB-012", name: "缶バッジ（E）", price: 220 },
    { barcode: "PUB-013", name: "缶バッジ（F）", price: 220 },
    { barcode: "PUB-014", name: "缶バッジ（G）", price: 220 },
  ],
  "維持員担当　委託": [
    { barcode: "MEM-001", name: "維持員バッジ（新）", price: 2000 },
    { barcode: "MEM-002", name: "維持員バッジ（旧）", price: 1500 },
    { barcode: "MEM-003", name: "維持員バッジ（七宝）", price: 1500 },
    { barcode: "MEM-004", name: "維持員ブローチ（金）", price: 2500 },
    { barcode: "MEM-005", name: "維持員ブローチ（銀）", price: 2500 },
  ],
  "講座運営課": [
    { barcode: "COUR-001", name: "もらんちゃんボールペン（ブルー）", price: 500 },
    { barcode: "COUR-002", name: "もらんちゃんボールペン（ピンク）", price: 500 },
  ],
  "事務室": [
    { barcode: "OFF-001", name: "コピー代金（白黒）", price: 10 },
    { barcode: "OFF-002", name: "コピー代金（カラー）", price: 30 },
  ]
};

export default function App() {
  // --- States ---
  const [inventory, setInventory] = useState(INITIAL_INVENTORY);
  const [scannedItems, setScannedItems] = useState([]); // { barcode, qty } の配列

  const [registeringBarcode, setRegisteringBarcode] = useState(null);
  const [newProduct, setNewProduct] = useState({ name: '', price: '', category: '', tempBarcode: '' });

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastMessage, setLastMessage] = useState({ type: '', text: '' });
  const [categories, setCategories] = useState([]);
  const [activeQuickTab, setActiveQuickTab] = useState('出版部　委託');

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastTransaction, setLastTransaction] = useState({ qty: 0, price: 0 });

  // 汎用確認ダイアログ用
  const [confirmProps, setConfirmProps] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: '',
    onConfirm: () => { },
    type: 'default' // 'default' | 'danger'
  });

  const openConfirm = (title, message, onConfirm, confirmText = '確定', type = 'default') => {
    setConfirmProps({ isOpen: true, title, message, onConfirm, confirmText, type });
  };

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
        let mergedInventory = {};

        // クイック選択用の商品をあらかじめマスタに入れておく
        Object.values(QUICK_ITEMS).flat().forEach(item => {
          const category = Object.keys(QUICK_ITEMS).find(cat => QUICK_ITEMS[cat].includes(item));
          mergedInventory[item.barcode] = { name: item.name, price: item.price, category: category };
        });

        // 新形式: { inventory, categories }
        if (data.inventory) {
          mergedInventory = { ...mergedInventory, ...data.inventory };
          setInventory(mergedInventory);
        } else {
          // 旧形式互換
          mergedInventory = { ...mergedInventory, ...data };
          setInventory(mergedInventory);
        }
        if (data.categories) {
          setCategories(data.categories);
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

  useEffect(() => {
    localStorage.setItem('POS_INVENTORY', JSON.stringify(inventory));
  }, [inventory]);

  useEffect(() => {
    localStorage.setItem('POS_CATEGORIES', JSON.stringify(categories));
  }, [categories]);

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


  // クイックボタン押下時の処理
  const handleQuickAdd = useCallback((item, category) => {
    if (isProcessingRef.current || isSubmittingRef.current) return;

    playBeep();

    // 在庫マスタになければ（万が一）その場で追加
    if (!inventoryRef.current[item.barcode]) {
      setInventory(prev => ({
        ...prev,
        [item.barcode]: { name: item.name, price: item.price, category: category }
      }));
    }

    setScannedItems(prevItems => {
      const existing = prevItems.find(i => i.barcode === item.barcode);
      if (existing) {
        return prevItems.map(i =>
          i.barcode === item.barcode ? { ...i, qty: i.qty + 1 } : i
        );
      } else {
        return [{ barcode: item.barcode, qty: 1 }, ...prevItems];
      }
    });
  }, [playBeep]);


  // --- Handlers ---

  // 新規商品を登録（GASにも送信）
  const handleRegisterNewProduct = async (passedBarcode = null) => {
    const code = passedBarcode || registeringBarcode;
    const price = parseInt(newProduct.price, 10);
    if (!code || isNaN(price) || !newProduct.name || isSubmitting) return;

    setIsSubmitting(true);
    isSubmittingRef.current = true;
    isProcessingRef.current = true;
    try {
      // 1. GASへ送信
      const response = await fetch(GAS_URL, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'text/plain' // application/jsonでCORSエラーが出る場合はtext/plainが有効
        },
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
        // フォームをリセット
        setNewProduct({ name: '', price: '', category: '', tempBarcode: '' });
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

  // 全クイック商品をマスターに一括登録する（管理者用）
  const handleBulkRegisterMaster = async () => {
    openConfirm(
      'マスター一括登録',
      'すべてのクイック用商品をスプレッドシートのマスターに登録しますか？（既に登録済みの場合は重複する可能性があります）',
      async () => {
        setIsSubmitting(true);
        let successCount = 0;
        try {
          const allItems = Object.keys(QUICK_ITEMS).flatMap(cat =>
            QUICK_ITEMS[cat].map(item => ({ ...item, category: cat }))
          );

          for (const item of allItems) {
            const response = await fetch(GAS_URL, {
              method: 'POST',
              mode: 'cors',
              headers: { 'Content-Type': 'text/plain' },
              body: JSON.stringify({
                type: 'MASTER_REGISTRATION',
                barcode: item.barcode,
                name: item.name,
                price: item.price,
                category: item.category
              })
            });
            const result = await response.json();
            if (result.result === 'success') { successCount++; }
          }
          setLastMessage({ type: 'success', text: `${successCount}件のマスター登録を送信しました` });
        } catch (err) {
          setLastMessage({ type: 'error', text: '一括登録中にエラーが発生しました' });
        } finally {
          setIsSubmitting(false);
          setTimeout(() => setLastMessage({ type: '', text: '' }), 3000);
        }
      },
      '一括登録を実行'
    );
  };

  // お会計確定（スプレッドシートへ送信）
  const handleCheckout = async () => {
    if (scannedItems.length === 0 || isSubmitting) return;

    openConfirm(
      'お会計の確定',
      'スキャンした商品を確定してスプレッドシートに送信します。よろしいですか？',
      async () => {
        setIsSubmitting(true);
        isSubmittingRef.current = true;
        isProcessingRef.current = true;

        const qtyAtCheckout = scannedItems.reduce((sum, item) => sum + item.qty, 0);
        const priceAtCheckout = scannedItems.reduce((sum, item) => {
          const productPrice = inventory[item.barcode]?.price || 0;
          return sum + (productPrice * item.qty);
        }, 0);

        try {
          // 1. マスター自動登録
          const unknownItems = scannedItems.filter(item => !inventory[item.barcode]);
          for (const item of unknownItems) {
            let info = null;
            let category = '未分類';
            for (const cat in QUICK_ITEMS) {
              const found = QUICK_ITEMS[cat].find(i => i.barcode === item.barcode);
              if (found) { info = found; category = cat; break; }
            }
            if (info) {
              await fetch(GAS_URL, {
                method: 'POST', mode: 'cors', headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({
                  type: 'MASTER_REGISTRATION',
                  barcode: item.barcode, name: info.name, price: info.price, category: category
                })
              });
            }
          }

          // 2. 売上データの送信
          const itemsToPost = scannedItems.map(item => ({
            barcode: item.barcode,
            name: inventory[item.barcode]?.name || '不明',
            qty: item.qty,
            price: inventory[item.barcode]?.price || 0,
            category: inventory[item.barcode]?.category || '未分類'
          }));

          const response = await fetch(GAS_URL, {
            method: 'POST', mode: 'cors', headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ type: 'SALES_LOG', items: itemsToPost })
          });

          const result = await response.json();
          if (result.result === 'success') {
            setScannedItems([]);
            setLastTransaction({ qty: qtyAtCheckout, price: priceAtCheckout });
            setShowSuccessModal(true);
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
      },
      '確定して保存'
    );
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
    openConfirm(
      '商品の削除',
      'この商品をリストから削除しますか？',
      () => setScannedItems(prev => prev.filter(item => item.barcode !== barcode)),
      '削除',
      'danger'
    );
  };

  const handleDeleteProductMaster = async (barcode) => {
    setIsSubmitting(true);
    try {
      const payload = {
        action: 'deleteProduct',
        barcode
      };

      const response = await fetch(GAS_URL, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      console.log('Delete Response:', result);

      // サーバー側が成功、または特にエラーメッセージがない場合はUIを更新
      if (result.status === 'success' || result.result === 'success' || result.result === 'ok') {
        setInventory(prev => {
          const next = { ...prev };
          delete next[barcode];
          return next;
        });

        // カートからも削除
        setScannedItems(prev => prev.filter(item => item.barcode !== barcode));
        setLastMessage({ type: 'success', text: '商品を削除しました' });
      } else {
        alert('サーバー側でエラーが発生しました: ' + (result.message || '不明なエラー'));
      }
    } catch (err) {
      console.error('Delete failed:', err);
      // 通信エラーでも、UI上は削除を試みるか、エラーを具体的に出す
      alert('削除通信エラーが発生しました。GAS側のdoPostの設定が正しいか確認してください。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const clearCart = () => {
    if (scannedItems.length === 0 || isSubmitting) return;
    openConfirm(
      '履歴のリセット',
      'スキャン履歴をすべてリセットしますか？この操作は取り消せません。',
      () => setScannedItems([]),
      'リセットする',
      'danger'
    );
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
          <h1 className="font-bold text-lg tracking-wide">生涯学習センター専用 POS会計システム</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-800 rounded-full border border-slate-700">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Online</span>
          </div>
        </div>
      </header>

      {/* 通知メッセージ */}
      {lastMessage.text && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-full shadow-2xl flex items-center gap-2 animate-in slide-in-from-top-4 duration-300 ${lastMessage.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
          }`}>
          {lastMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <span className="font-bold text-sm">{lastMessage.text}</span>
        </div>
      )}

      <main className="max-w-[1400px] mx-auto p-4 flex flex-col md:flex-row gap-6 h-[calc(100vh-80px)] overflow-hidden">

        {/* 左側：メイン（お会計状況・スキャン履歴） */}
        <section className="flex-1 flex flex-col gap-4 overflow-hidden">

          {/* 合計情報（メインらしく大胆に） */}
          <div className="flex flex-col sm:flex-row gap-4 shrink-0">
            <section className="flex-1 bg-slate-900 text-white rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/10 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-indigo-500/20 transition-all duration-700"></div>
              <div className="relative z-10">
                <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-500 mb-2">Grand Total</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-indigo-400">¥</span>
                  <p className="text-7xl font-black tracking-tighter leading-none">{totalPrice.toLocaleString()}</p>
                </div>
              </div>
            </section>

            <section className="bg-white rounded-[2.5rem] p-8 px-10 border border-slate-200 shadow-sm flex flex-col justify-center shrink-0">
              <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-400 mb-2">Item Count</p>
              <p className="text-6xl font-black text-slate-800 tracking-tighter leading-none">
                {totalQty} <span className="text-2xl font-bold text-slate-300">pcs</span>
              </p>
            </section>
          </div>

          {/* スキャン履歴（主画面として広く活用） */}
          <section className="flex-1 bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden flex flex-col">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center shadow-sm">
                  <ShoppingCart className="w-7 h-7" />
                </div>
                <div>
                  <h2 className="font-black text-slate-800 text-2xl">スキャン履歴・一覧</h2>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">Transaction List</p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-4 scrollbar-hide">
              {scannedItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-200 py-20">
                  <div className="w-40 h-40 bg-slate-50 rounded-full flex items-center justify-center mb-8">
                    <Barcode className="w-20 h-20 opacity-10 animate-pulse" />
                  </div>
                  <h3 className="text-2xl font-black text-slate-300 mb-2">スキャン待機中...</h3>
                  <p className="text-base font-bold opacity-60">お手元のリーダーで読み取るか、右から選んでください</p>
                </div>
              ) : (
                scannedItems.map((item) => {
                  const product = inventory[item.barcode];
                  const itemTotal = (product?.price || 0) * item.qty;
                  return (
                    <div key={item.barcode} className="bg-white rounded-[2rem] p-6 flex items-center gap-8 border border-slate-100 hover:border-indigo-200 hover:shadow-2xl hover:shadow-indigo-50/50 transition-all group">
                      <div className="w-16 h-16 bg-slate-50 rounded-[1.5rem] flex items-center justify-center border border-slate-100 shrink-0 group-hover:bg-indigo-50 group-hover:scale-105 transition-all">
                        <Tag className="w-8 h-8 text-slate-300 group-hover:text-indigo-400 transition" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-4 mb-2">
                          <p className="font-black text-slate-800 text-xl truncate leading-tight">{product?.name || '不明な商品'}</p>
                          {product?.category && (
                            <span className="shrink-0 px-3 py-1 bg-slate-100 text-[11px] font-black text-slate-500 rounded-xl uppercase tracking-widest">{product.category}</span>
                          )}
                        </div>
                        <p className="text-sm font-bold text-slate-400 font-mono tracking-tighter">Barcode: {item.barcode} | @ ¥{product?.price?.toLocaleString() || 0}</p>
                      </div>
                      <div className="flex items-center gap-4 bg-slate-50 rounded-2xl p-2 border border-slate-100 shadow-inner shrink-0">
                        <button onClick={() => updateQty(item.barcode, -1)} className="w-12 h-12 bg-white hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-2xl flex items-center justify-center shadow-sm transition active:scale-90"><Minus className="w-5 h-5" /></button>
                        <span className="w-10 text-center text-2xl font-black text-slate-800">{item.qty}</span>
                        <button onClick={() => updateQty(item.barcode, 1)} className="w-12 h-12 bg-white hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-2xl flex items-center justify-center shadow-sm transition active:scale-90"><Plus className="w-5 h-5" /></button>
                      </div>
                      <div className="text-right min-w-[150px] shrink-0">
                        <p className="text-3xl font-black text-slate-800 tracking-tighter leading-tight">¥{itemTotal.toLocaleString()}</p>
                        <button onClick={() => removeItem(item.barcode)} className="text-xs font-bold text-slate-300 hover:text-rose-500 transition-colors mt-2 uppercase tracking-[0.2em] flex items-center gap-2 ml-auto">
                          <Trash2 className="w-4 h-4" /> Remove
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            
            <div className="p-8 bg-slate-50/50 border-t border-slate-100 shrink-0">
              <button
                onClick={handleCheckout}
                disabled={scannedItems.length === 0 || isSubmitting}
                className="w-full bg-indigo-600 text-white py-6 rounded-3xl font-black text-2xl shadow-2xl shadow-indigo-200 hover:bg-indigo-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-4"
              >
                {isSubmitting ? <Loader2 className="w-8 h-8 animate-spin" /> : <ChevronRight className="w-8 h-8" />}
                {isSubmitting ? '記録中...' : 'お会計を確定する'}
              </button>
            </div>
          </section>
        </section>

        {/* 右側：サブ（クイック選択パネル・補助的） */}
        <aside className="w-full md:w-[480px] flex flex-col gap-4 overflow-hidden shrink-0">
          <section className="flex-1 bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden flex flex-col">
            <div className="bg-slate-50/80 p-6 border-b border-slate-100 shrink-0">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-6 flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500 fill-amber-500" /> Quick Select
              </h3>
              <nav className="flex flex-wrap items-center gap-3">
                {Object.keys(QUICK_ITEMS).map(catName => (
                  <button
                    key={catName}
                    onClick={() => setActiveQuickTab(catName)}
                    className={`px-5 py-3 rounded-2xl text-xs font-black transition-all border-2 ${activeQuickTab === catName
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl shadow-indigo-100 scale-105'
                        : 'bg-white border-slate-100 text-slate-400 hover:text-slate-600 hover:border-slate-200'
                      }`}
                  >
                    {catName}
                  </button>
                ))}
                <button
                  onClick={() => setActiveQuickTab(ADMIN_TAB)}
                  className={`px-5 py-3 rounded-2xl text-xs font-black transition-all border-2 ${activeQuickTab === ADMIN_TAB
                      ? 'bg-slate-900 border-slate-900 text-white shadow-xl shadow-slate-100 scale-105'
                      : 'bg-white border-slate-100 text-slate-400 hover:text-slate-600 hover:border-slate-200'
                    }`}
                >
                  {ADMIN_TAB}
                </button>
              </nav>
            </div>

            <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
              {activeQuickTab === ADMIN_TAB ? (
                <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                  {/* 新規登録フォーム（より簡潔に・エラー耐性高く） */}
                  <div className="bg-indigo-50/50 rounded-[2.5rem] p-8 border border-indigo-100">
                    <h4 className="text-lg font-black text-indigo-900 mb-6 flex items-center gap-2">
                      <Plus className="w-5 h-5" /> 商品を新規登録
                    </h4>
                    <div className="space-y-4">
                      <input
                        type="text"
                        placeholder="商品名（必須）"
                        className="w-full bg-white border border-indigo-100 rounded-2xl px-5 py-4 text-base font-bold focus:outline-none focus:ring-4 focus:ring-indigo-100 transition"
                        value={newProduct?.name || ''}
                        onChange={e => setNewProduct({ ...newProduct, name: e.target.value })}
                      />
                      <div className="flex gap-4">
                        <input
                          type="number"
                          placeholder="価格 ¥"
                          className="flex-1 bg-white border border-indigo-100 rounded-2xl px-5 py-4 text-base font-bold focus:outline-none focus:ring-4 focus:ring-indigo-100 transition"
                          value={newProduct?.price || ''}
                          onChange={e => setNewProduct({ ...newProduct, price: e.target.value })}
                        />
                        <select
                          className="flex-1 bg-white border border-indigo-100 rounded-2xl px-5 py-4 text-base font-bold focus:outline-none focus:ring-4 focus:ring-indigo-100 transition"
                          value={newProduct?.category || ''}
                          onChange={e => setNewProduct({ ...newProduct, category: e.target.value })}
                        >
                          <option value="">区分を選択</option>
                          {(categories || []).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                      </div>
                      <input
                        type="text"
                        placeholder="バーコード（空欄なら自動生成）"
                        className="w-full bg-white border border-indigo-100 rounded-2xl px-5 py-4 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-indigo-100 transition"
                        value={newProduct?.tempBarcode || ''}
                        onChange={e => setNewProduct({ ...newProduct, tempBarcode: e.target.value })}
                      />
                      <button
                        onClick={() => {
                          if (!newProduct?.name || !newProduct?.price || !newProduct?.category) return alert('必須項目をすべて入力してください');
                          const barcode = newProduct.tempBarcode || `MAN-${Date.now()}`;
                          handleRegisterNewProduct(barcode);
                        }}
                        disabled={isSubmitting}
                        className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black text-lg hover:bg-indigo-700 active:scale-95 transition shadow-2xl shadow-indigo-100 flex items-center justify-center gap-3"
                      >
                        {isSubmitting ? <Loader2 className="w-6 h-6 animate-spin" /> : <CheckCircle2 className="w-6 h-6" />}
                        マスターに登録する
                      </button>
                    </div>
                  </div>

                  {/* 在庫一覧・削除（慎重にループ） */}
                  <div>
                    <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2 px-2">
                      <List className="w-4 h-4" /> 登録商品リスト（削除可能）
                    </h4>
                    <div className="space-y-3">
                      {Object.entries(inventory || {}).slice(0, 100).map(([barcode, item]) => {
                        if (!item) return null;
                        return (
                          <div key={barcode} className="flex items-center justify-between p-5 bg-white border border-slate-100 rounded-3xl hover:border-rose-100 hover:bg-rose-50/10 transition group shadow-sm">
                            <div className="min-w-0 pr-4">
                              <p className="font-black text-slate-800 text-base truncate">{item.name || '名称未設定'}</p>
                              <p className="text-xs font-bold text-slate-400 font-mono">¥{(Number(item.price) || 0).toLocaleString()} | {barcode}</p>
                            </div>
                            <button
                              onClick={() => {
                                openConfirm("商品の削除", `「${item.name || barcode}」を削除しますか？`, () => handleDeleteProductMaster(barcode), "削除する", "danger");
                              }}
                              className="w-12 h-12 flex items-center justify-center bg-slate-50 text-slate-300 hover:bg-rose-100 hover:text-rose-600 rounded-2xl transition-all"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  <div className="mt-12 px-2 text-center pb-8 border-t border-slate-50 pt-8">
                    <p className="text-sm font-bold text-slate-500 italic leading-relaxed">
                      【重要】<br />
                      スプレッドシートを直接編集した場合は、<br />
                      ブラウザを更新（再読み込み）すると最新の状態が反映されます。
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {(QUICK_ITEMS[activeQuickTab] || []).map(item => (
                    <button
                      key={item.barcode}
                      onClick={() => handleQuickAdd(item, activeQuickTab)}
                      disabled={isSubmitting}
                      className="flex flex-col items-center p-6 bg-slate-50/50 border border-slate-100 rounded-[2rem] hover:bg-white hover:border-indigo-200 hover:shadow-2xl hover:-translate-y-1 active:scale-95 transition-all group overflow-hidden"
                    >
                      <span className="text-sm font-bold text-slate-800 text-center mb-4 min-h-[2.5rem] leading-tight group-hover:text-indigo-700 transition block w-full">
                        {item.name.split('（').map((part, i) => (
                          <React.Fragment key={i}>
                            {i > 0 && <br />}
                            {i > 0 ? `（${part}` : part}
                          </React.Fragment>
                        ))}
                      </span>
                      <p className="mt-auto text-2xl font-black text-indigo-600 flex items-center gap-1">
                        <span className="text-xs font-bold opacity-50">¥</span>{item.price.toLocaleString()}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="p-6 bg-slate-900 border-t border-slate-800 shrink-0">
              <div className="flex items-center justify-center">
                <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em]">Integrated Spreadsheet POS System</span>
              </div>
            </div>
          </section>
        </aside>

      </main>

      <footer className="h-12 flex items-center justify-center bg-slate-50 border-t border-slate-100 shrink-0">
        <p className="text-sm font-bold text-slate-400 tracking-wider">
          © 2026 k.hirano@mic
        </p>
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

      {/* お会計完了モーダル */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4 z-[100] animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-sm shadow-2xl border border-white/20 overflow-hidden relative animate-in zoom-in-95 duration-300">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full -mr-10 -mt-10 opacity-60"></div>

            <div className="relative z-10 text-center">
              <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 scale-110 shadow-sm border border-emerald-100">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <h3 className="text-2xl font-black text-slate-800 mb-2">お会計完了！</h3>
              <p className="text-slate-500 text-sm font-medium mb-8">スプレッドシートに記録しました</p>

              <div className="bg-slate-50 rounded-3xl p-6 mb-8 flex justify-between items-center border border-slate-100 shadow-inner">
                <div className="text-left">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Items</p>
                  <p className="text-xl font-black text-slate-800">{lastTransaction.qty} <span className="text-xs font-bold text-slate-400">点</span></p>
                </div>
                <div className="h-10 w-px bg-slate-200"></div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Total</p>
                  <p className="text-2xl font-black text-indigo-600">¥{lastTransaction.price.toLocaleString()}</p>
                </div>
              </div>

              <button
                onClick={() => setShowSuccessModal(false)}
                className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold text-lg hover:bg-slate-800 active:scale-95 transition-all shadow-xl"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 汎用確認ダイアログ（カスタムモーダル） */}
      {confirmProps.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[150] animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-black text-slate-800 mb-3">{confirmProps.title}</h3>
            <p className="text-slate-600 text-sm mb-8 leading-relaxed font-medium">
              {confirmProps.message}
            </p>
            <div className="flex gap-3">
              <button
                className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition active:scale-95"
                onClick={() => setConfirmProps({ ...confirmProps, isOpen: false })}
              >
                キャンセル
              </button>
              <button
                className={`flex-1 px-4 py-3 text-white font-bold rounded-xl transition active:scale-95 shadow-lg ${confirmProps.type === 'danger' ? 'bg-rose-500 hover:bg-rose-600 shadow-rose-100' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100'
                  }`}
                onClick={() => {
                  setConfirmProps({ ...confirmProps, isOpen: false });
                  confirmProps.onConfirm();
                }}
              >
                {confirmProps.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
