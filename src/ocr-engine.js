// OCRエンジンモジュール - Tesseract.js Workerプール管理
// 単語レベルのバウンディングボックス座標付きOCR結果を返す
import { createWorker } from 'tesseract.js';

export class OCREngine {
  constructor() {
    this.workers = [];
    this.isInitialized = false;
    this.isCancelled = false;
  }

  /**
   * Workerプールを初期化
   */
  async initialize(workerCount, lang, onProgress) {
    this.isCancelled = false;

    if (this.isInitialized) {
      await this.terminate();
    }

    const workers = [];
    for (let i = 0; i < workerCount; i++) {
      if (onProgress) onProgress(`ワーカー ${i + 1}/${workerCount} を初期化中...`);

      const worker = await createWorker(lang, 1, {
        logger: () => {},
      });

      workers.push(worker);
    }

    this.workers = workers;
    this.isInitialized = true;
  }

  /**
   * 複数画像をバッチOCR処理
   * 各ファイルの結果は { text, lines } の構造で返る
   * lines には各行のテキストとバウンディングボックス、単語情報を含む
   */
  async processBatch(items, onFileStart, onFileComplete, onFileError) {
    if (!this.isInitialized) {
      throw new Error('OCRエンジンが初期化されていません');
    }

    const results = new Map();
    const queue = [...items];

    const workerPromises = this.workers.map((worker) => {
      return this._workerLoop(worker, queue, results, onFileStart, onFileComplete, onFileError);
    });

    await Promise.all(workerPromises);
    return results;
  }

  /**
   * 各ワーカーのループ処理
   */
  async _workerLoop(worker, queue, results, onFileStart, onFileComplete, onFileError) {
    while (queue.length > 0 && !this.isCancelled) {
      const item = queue.shift();
      if (!item) break;

      try {
        if (onFileStart) onFileStart(item.index);

        const imageData = await this._fileToImageData(item.file);

        // OCR実行 - 全データを取得（バウンディングボックス含む）
        const { data } = await worker.recognize(imageData);

        // 構造化されたOCR結果を作成
        const ocrResult = this._extractStructuredResult(data);

        console.log(`[OCR完了] ${item.file.name}: ${ocrResult.lines.length}行, "${ocrResult.text.substring(0, 60)}..."`);

        results.set(item.index, ocrResult);
        if (onFileComplete) onFileComplete(item.index, ocrResult.text);
      } catch (error) {
        console.error(`[OCRエラー] ファイル "${item.file.name}":`, error);
        results.set(item.index, { text: '', lines: [] });
        if (onFileError) onFileError(item.index, error);
      }
    }
  }

  /**
   * Tesseract.jsの認識結果から構造化データを抽出
   * 各行・各単語のバウンディングボックス座標を保持
   */
  _extractStructuredResult(data) {
    const lines = [];

    if (data.lines) {
      for (const line of data.lines) {
        const lineData = {
          text: line.text.trim(),
          bbox: { ...line.bbox }, // { x0, y0, x1, y1 } - 画像ピクセル座標
          words: [],
        };

        if (line.words) {
          for (const word of line.words) {
            if (word.text.trim()) {
              lineData.words.push({
                text: word.text.trim(),
                bbox: { ...word.bbox },
                confidence: word.confidence,
              });
            }
          }
        }

        if (lineData.text) {
          lines.push(lineData);
        }
      }
    }

    return {
      text: data.text || '',
      lines,
      // 元画像のサイズ情報（座標変換に使用）
      imageWidth: data.imageWidth || 0,
      imageHeight: data.imageHeight || 0,
    };
  }

  _fileToImageData(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  cancel() {
    this.isCancelled = true;
  }

  async terminate() {
    for (const worker of this.workers) {
      try {
        await worker.terminate();
      } catch (e) {
        // 無視
      }
    }
    this.workers = [];
    this.isInitialized = false;
  }
}
