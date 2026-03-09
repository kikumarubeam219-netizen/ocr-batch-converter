// PDF生成モジュール - 座標ベースの検索可能PDF生成（日本語OCRテキスト対応）
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { saveAs } from 'file-saver';

// A4サイズ (pt単位)
const PAGE_SIZES = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 },
};

export class PDFGenerator {
  constructor() {
    this.pdfDoc = null;
    this.pdfBytes = null;
    this._cachedFontBytes = null;
  }

  /**
   * 日本語フォントを読み込み・キャッシュ
   */
  async _loadJapaneseFont() {
    if (this._cachedFontBytes) return this._cachedFontBytes;

    console.log('[PDF] 日本語フォントを読み込み中...');
    const response = await fetch('/fonts/NotoSansJP.ttf');
    if (!response.ok) {
      throw new Error(`フォントの読み込みに失敗: ${response.status}`);
    }
    this._cachedFontBytes = new Uint8Array(await response.arrayBuffer());
    console.log(`[PDF] フォント読み込み完了 (${(this._cachedFontBytes.length / 1024 / 1024).toFixed(1)}MB)`);
    return this._cachedFontBytes;
  }

  /**
   * 画像ファイルの実際のピクセルサイズを取得
   */
  _getImageNaturalSize(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({ width: 0, height: 0 });
      };
      img.src = url;
    });
  }

  /**
   * 画像とOCR結果からPDFを生成
   * @param {Array<{file: File, ocrData: object}>} items
   *   ocrData: { text, lines: [{text, bbox, words: [{text, bbox}]}] }
   * @param {object} options
   * @param {function} onProgress
   */
  async generate(items, options = {}, onProgress) {
    const { pageSize = 'auto', quality = 0.9 } = options;

    this.pdfDoc = await PDFDocument.create();

    // OCRテキストがある場合は日本語フォントを準備
    const hasText = items.some(item => item.ocrData && item.ocrData.lines && item.ocrData.lines.length > 0);
    let japaneseFont = null;

    if (hasText) {
      try {
        this.pdfDoc.registerFontkit(fontkit);
        const fontBytes = await this._loadJapaneseFont();
        japaneseFont = await this.pdfDoc.embedFont(fontBytes, { subset: false });
        console.log('[PDF] 日本語フォントの埋め込み準備完了');
      } catch (error) {
        console.error('[PDF] 日本語フォントの読み込みに失敗:', error);
      }
    }

    for (let i = 0; i < items.length; i++) {
      if (onProgress) onProgress(i + 1, items.length);

      const { file, ocrData } = items[i];

      try {
        // 元画像のピクセルサイズを取得（OCR座標→PDF座標の変換に必要）
        const naturalSize = await this._getImageNaturalSize(file);

        // 画像を読み込み
        const imageBytes = await this._readFile(file);
        const image = await this._embedImage(imageBytes, file.type);

        if (!image) {
          console.warn(`サポートされていない画像形式をスキップ: ${file.name}`);
          continue;
        }

        // ページサイズを決定
        const dims = this._getPageDimensions(image, pageSize);
        const page = this.pdfDoc.addPage([dims.width, dims.height]);

        // 画像を描画
        page.drawImage(image, {
          x: 0,
          y: 0,
          width: dims.width,
          height: dims.height,
        });

        // OCRテキストを座標ベースで透明レイヤーとして追加
        if (ocrData && ocrData.lines && ocrData.lines.length > 0 && japaneseFont) {
          // 画像ピクセル座標 → PDF座標 のスケール比率を計算
          const imgPixelWidth = naturalSize.width || image.width;
          const imgPixelHeight = naturalSize.height || image.height;
          const scaleX = dims.width / imgPixelWidth;
          const scaleY = dims.height / imgPixelHeight;

          console.log(`[PDF] テキスト配置: 画像 ${imgPixelWidth}x${imgPixelHeight}px → PDF ${dims.width.toFixed(0)}x${dims.height.toFixed(0)}pt, scale=${scaleX.toFixed(3)}x${scaleY.toFixed(3)}`);

          this._addTextLayerWithBbox(page, ocrData, dims, japaneseFont, scaleX, scaleY);
        }
      } catch (error) {
        console.error(`ページ "${file.name}" の追加に失敗:`, error);
      }
    }

    this.pdfBytes = await this.pdfDoc.save();
    return this.pdfBytes;
  }

  /**
   * バウンディングボックス座標を使って正確な位置にテキストを配置
   */
  _addTextLayerWithBbox(page, ocrData, dims, font, scaleX, scaleY) {
    let placedCount = 0;

    for (const line of ocrData.lines) {
      // 行内の各単語を個別に配置
      const wordsToPlace = line.words && line.words.length > 0 ? line.words : [line];

      for (const word of wordsToPlace) {
        if (!word.text || !word.text.trim() || !word.bbox) continue;

        try {
          const { bbox } = word;

          // バウンディングボックスの高さからフォントサイズを計算
          const bboxHeightPx = bbox.y1 - bbox.y0;
          const fontSize = Math.max(2, Math.min(72, bboxHeightPx * scaleY * 0.8));

          // 画像ピクセル座標 → PDF座標に変換
          // PDF座標系: 原点は左下、Y軸は上向き
          // 画像座標系: 原点は左上、Y軸は下向き
          const pdfX = bbox.x0 * scaleX;
          const pdfY = dims.height - (bbox.y1 * scaleY); // Y軸を反転

          // フォントがサポートしない文字を除去
          const safeText = this._sanitizeText(word.text.trim(), font);
          if (!safeText) continue;

          page.drawText(safeText, {
            x: pdfX,
            y: pdfY,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0),
            opacity: 0, // 完全透明 = 見えないが検索・選択可能
          });

          placedCount++;
        } catch (e) {
          // 個別の単語の描画失敗はスキップ
        }
      }
    }

    console.log(`[PDF] ${placedCount}個の単語を座標ベースで配置完了`);
  }

  /**
   * 画像をPDFに埋め込み
   */
  async _embedImage(imageBytes, mimeType) {
    try {
      if (mimeType === 'image/png') {
        return await this.pdfDoc.embedPng(imageBytes);
      } else if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
        return await this.pdfDoc.embedJpg(imageBytes);
      } else {
        const jpegBytes = await this._convertToJpeg(imageBytes, mimeType);
        return await this.pdfDoc.embedJpg(jpegBytes);
      }
    } catch (error) {
      console.error('画像の埋め込みエラー:', error);
      try {
        const jpegBytes = await this._convertToJpeg(imageBytes, mimeType);
        return await this.pdfDoc.embedJpg(jpegBytes);
      } catch (e) {
        console.error('画像変換も失敗:', e);
        return null;
      }
    }
  }

  /**
   * 任意の画像をJPEGに変換
   */
  _convertToJpeg(imageBytes, mimeType) {
    return new Promise((resolve, reject) => {
      const blob = new Blob([imageBytes], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url);
          if (blob) {
            blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf)));
          } else {
            reject(new Error('JPEG変換に失敗'));
          }
        }, 'image/jpeg', 0.92);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('画像の読み込みに失敗'));
      };
      img.src = url;
    });
  }

  /**
   * ページサイズを計算
   */
  _getPageDimensions(image, pageSize) {
    const imgWidth = image.width;
    const imgHeight = image.height;

    if (pageSize === 'auto') {
      const maxDim = 1190;
      const scale = Math.min(1, maxDim / Math.max(imgWidth, imgHeight));
      return {
        width: imgWidth * scale,
        height: imgHeight * scale,
      };
    }

    const target = PAGE_SIZES[pageSize] || PAGE_SIZES.a4;
    return {
      width: target.width,
      height: target.height,
    };
  }

  /**
   * フォントがサポートしない文字を除去
   */
  _sanitizeText(text, font) {
    let result = '';
    for (const char of text) {
      try {
        font.encodeText(char);
        result += char;
      } catch {
        result += ' ';
      }
    }
    return result.trim();
  }

  _readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  download(filename = 'ocr-output.pdf') {
    if (!this.pdfBytes) {
      throw new Error('PDFが生成されていません');
    }
    const blob = new Blob([this.pdfBytes], { type: 'application/pdf' });
    saveAs(blob, filename);
  }

  getSizeMB() {
    if (!this.pdfBytes) return 0;
    return (this.pdfBytes.length / (1024 * 1024)).toFixed(2);
  }
}
