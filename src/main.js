// メインエントリーポイント - アプリケーション全体の制御
// フロー: 画像/PDF選択 → PDF生成 → OCR処理 → ダウンロード
import './style.css';
import { FileManager } from './file-manager.js';
import { OCREngine } from './ocr-engine.js';
import { PDFGenerator } from './pdf-generator.js';
import { PDFReader } from './pdf-reader.js';
import { UIController } from './ui-controller.js';

class App {
  constructor() {
    this.fileManager = new FileManager();
    this.ocrEngine = new OCREngine();
    this.pdfGenerator = new PDFGenerator();
    this.ui = new UIController();

    /** @type {Map<number, string>} OCR結果 (index => text) */
    this.ocrResults = new Map();

    this.startTime = null;
    this.timerInterval = null;
    this.completedCount = 0;

    this._bindEvents();
  }

  _bindEvents() {
    const { els } = this.ui;

    // ドラッグ＆ドロップ
    els.dropzone.addEventListener('click', () => els.fileInput.click());
    els.dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      els.dropzone.classList.add('dragover');
    });
    els.dropzone.addEventListener('dragleave', () => {
      els.dropzone.classList.remove('dragover');
    });
    els.dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      els.dropzone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        this._handleFiles(e.dataTransfer.files);
      }
    });

    // ファイル入力
    els.fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this._handleFiles(e.target.files);
        e.target.value = '';
      }
    });

    // ファイル追加ボタン
    els.btnAddMore.addEventListener('click', () => els.fileInput.click());

    // クリアボタン
    els.btnClear.addEventListener('click', () => {
      this.fileManager.clear();
      this.ocrResults.clear();
      this.ui.hideAll();
      this.ui.setStep(1);
      this.ui.showToast('ファイルリストをクリアしました', 'info');
    });

    // PDF生成（ステップ2: 最初に実行）
    els.btnGeneratePdf.addEventListener('click', () => this._generatePDF());

    // OCR処理（ステップ3: PDF生成後に実行）
    els.btnStartOcr.addEventListener('click', () => this._startOCR());

    // ダウンロード
    els.btnDownload.addEventListener('click', () => {
      this.pdfGenerator.download('ocr-output.pdf');
      this.ui.showToast('PDFのダウンロードを開始しました', 'success');
    });

    // キャンセル
    els.btnCancel.addEventListener('click', () => {
      this.ocrEngine.cancel();
      this._stopTimer();
      this.ui.setButtonsDisabled(false);
      this.ui.els.btnGeneratePdf.style.display = '';
      this.ui.els.btnCancel.style.display = 'none';
      this.ui.els.btnStartOcr.style.display = 'none';
      this.ui.showToast('処理をキャンセルしました', 'warning');
    });
  }

  /**
   * ファイル選択時の処理
   * PDFファイルが含まれている場合は各ページを画像に展開する
   */
  async _handleFiles(fileList) {
    const added = this.fileManager.addFiles(fileList);

    if (added === 0) {
      this.ui.showToast('対応形式のファイルがありません', 'warning');
      return;
    }

    // PDFファイルを画像に展開
    const pdfFiles = this.fileManager.files.filter(f => PDFReader.isPDF(f));
    if (pdfFiles.length > 0) {
      this.ui.showToast(`${pdfFiles.length}件のPDFをページ画像に展開中...`, 'info', 10000);

      // PDFでないファイルだけ残す
      const nonPdfFiles = this.fileManager.files.filter(f => !PDFReader.isPDF(f));
      this.fileManager.files = nonPdfFiles;

      // 各PDFファイルをページ画像に変換
      for (const pdfFile of pdfFiles) {
        try {
          const pageImages = await PDFReader.extractPages(pdfFile, (current, total) => {
            this.ui.showToast(
              `${pdfFile.name}: ${current}/${total} ページ展開中...`, 'info', 2000
            );
          });
          // 展開したページ画像をファイルリストに追加
          for (const pageImage of pageImages) {
            this.fileManager.files.push(pageImage);
          }
          console.log(`[PDF展開] ${pdfFile.name}: ${pageImages.length}ページ → 画像に変換完了`);
        } catch (error) {
          console.error(`[PDF展開エラー] ${pdfFile.name}:`, error);
          this.ui.showToast(`PDFの展開に失敗: ${pdfFile.name}`, 'error', 5000);
        }
      }
    }

    // ファイル名順にソート
    this.fileManager.sortByName();

    this.ui.showToast(`合計 ${this.fileManager.count} ページ`, 'success');
    this.ui.showFilelist();
    this.ui.setStep(1);

    // ファイルリストをレンダリング
    this.ui.renderFileList(this.fileManager.files, this.fileManager.thumbnails);

    // サムネイルを非同期生成
    await this.fileManager.generateAllThumbnails((index, dataUrl) => {
      this.ui.updateFileThumbnail(index, dataUrl);
    });
  }

  /**
   * ステップ2: PDF生成（画像のみ、OCRテキストなし）
   */
  async _generatePDF() {
    const settings = this.ui.getSettings();
    const items = [];

    // 画像ファイルを組み合わせ（OCRテキストなし）
    for (let i = 0; i < this.fileManager.files.length; i++) {
      items.push({
        file: this.fileManager.files[i],
        ocrData: null, // OCRはまだ実行されていないため空
      });
    }

    if (items.length === 0) {
      this.ui.showToast('ファイルが選択されていません', 'error');
      return;
    }

    this.ui.setButtonsDisabled(true);
    this.ui.showPdfProcessing();
    this.ui.setCurrentFile('PDFを生成中...');
    this.ui.showToast('画像からPDFを生成しています...', 'info');

    // 進捗をリセット
    this.completedCount = 0;
    this.ui.updateProgress(0, items.length);

    try {
      await this.pdfGenerator.generate(
        items,
        { pageSize: settings.pageSize, quality: settings.quality },
        (current, total) => {
          this.ui.updateProgress(current, total);
          this.ui.setCurrentFile(`ページ作成中: ${current}/${total}`);
        }
      );

      const sizeMB = this.pdfGenerator.getSizeMB();
      this.ui.setCompletionText(
        `${items.length}ページ、${sizeMB}MBのPDFが生成されました。OCR処理を追加して検索可能にできます。`
      );
      this.ui.showOcrReady();
      this.ui.showToast(`PDF生成完了！ (${sizeMB}MB) — OCR処理でテキスト検索を追加できます`, 'success');

    } catch (error) {
      console.error('PDF生成エラー:', error);
      this.ui.showToast(`PDF生成中にエラーが発生しました: ${error.message}`, 'error', 8000);
    } finally {
      this.ui.setButtonsDisabled(false);
    }
  }

  /**
   * ステップ3: OCR処理 → テキスト付きPDFを再生成
   */
  async _startOCR() {
    const settings = this.ui.getSettings();
    const totalFiles = this.fileManager.count;

    if (totalFiles === 0) {
      this.ui.showToast('ファイルが選択されていません', 'error');
      return;
    }

    // UI更新
    this.ui.setButtonsDisabled(true);
    this.ui.showOcrProcessing();
    this.completedCount = 0;
    this.ocrResults.clear();

    // タイマー開始
    this._startTimer();

    try {
      // OCRエンジン初期化
      this.ui.setCurrentFile('OCRエンジンを初期化中...');
      this.ui.showToast(`${settings.lang} 言語モデルを読み込み中...`, 'info', 6000);

      await this.ocrEngine.initialize(settings.workerCount, settings.lang, (msg) => {
        this.ui.setCurrentFile(msg);
      });

      this.ui.showToast('OCRエンジンの準備完了', 'success');

      // バッチ処理用の項目一覧を作成
      const items = this.fileManager.files.map((file, index) => ({ file, index }));

      // OCR実行
      this.ocrResults = await this.ocrEngine.processBatch(
        items,
        // onFileStart
        (index) => {
          this.ui.setFileStatus(index, 'processing');
          this.ui.setCurrentFile(this.fileManager.files[index].name);
        },
        // onFileComplete
        (index, text) => {
          this.completedCount++;
          this.ui.setFileStatus(index, 'done');
          this.ui.updateProgress(this.completedCount, totalFiles);
          this._updateEta();
        },
        // onFileError
        (index, error) => {
          this.completedCount++;
          this.ui.setFileStatus(index, 'error');
          this.ui.updateProgress(this.completedCount, totalFiles);
          this._updateEta();
        }
      );

      this._stopTimer();

      if (this.ocrEngine.isCancelled) {
        this.ui.showToast('処理がキャンセルされました', 'warning');
        return;
      }

      // OCR完了 → テキスト付きPDFを再生成
      this.ui.updateProgress(totalFiles, totalFiles);
      this.ui.showToast('OCR完了！テキスト付きPDFを再生成中...', 'info');
      this.ui.setCurrentFile('テキスト付きPDFを再生成中...');

      // テキスト付きPDFを再生成（座標付きOCRデータを渡す）
      const pdfItems = [];
      for (let i = 0; i < this.fileManager.files.length; i++) {
        pdfItems.push({
          file: this.fileManager.files[i],
          ocrData: this.ocrResults.get(i) || null,
        });
      }

      await this.pdfGenerator.generate(
        pdfItems,
        { pageSize: settings.pageSize, quality: settings.quality },
        (current, total) => {
          this.ui.setCurrentFile(`検索可能PDF生成中: ${current}/${total}`);
        }
      );

      const sizeMB = this.pdfGenerator.getSizeMB();
      this.ui.setCompletionText(
        `${totalFiles}ページ、${sizeMB}MB の検索可能なPDFが完成しました。`
      );
      this.ui.showDownloadReady();
      this.ui.showToast(`OCR処理完了！ 検索可能PDF (${sizeMB}MB) をダウンロードできます`, 'success');

    } catch (error) {
      console.error('OCRエラー:', error);
      this.ui.showToast(`OCR処理中にエラーが発生しました: ${error.message}`, 'error', 8000);
    } finally {
      this.ui.setButtonsDisabled(false);
      await this.ocrEngine.terminate();
    }
  }

  // --- タイマー ---

  _startTimer() {
    this.startTime = Date.now();
    this.timerInterval = setInterval(() => {
      const elapsed = Date.now() - this.startTime;
      this.ui.updateProgressInfo(this._formatTime(elapsed), this._getEtaString());
    }, 1000);
  }

  _stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  _updateEta() {
    // ETA文字列の更新はタイマーで行うので、ここでは計算のみ
  }

  _getEtaString() {
    if (!this.startTime || this.completedCount === 0) return '計算中...';

    const elapsed = Date.now() - this.startTime;
    const perFile = elapsed / this.completedCount;
    const remaining = this.fileManager.count - this.completedCount;
    const eta = perFile * remaining;

    if (remaining <= 0) return '完了';
    return `約 ${this._formatTime(eta)}`;
  }

  _formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
}

// アプリ起動
new App();
