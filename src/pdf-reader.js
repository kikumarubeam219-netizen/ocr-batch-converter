// PDFリーダーモジュール - PDFファイルの各ページを画像に変換
import * as pdfjsLib from 'pdfjs-dist';

// PDF.jsのWorkerを設定
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export class PDFReader {
  /**
   * PDFファイルの各ページをCanvas経由でPNG画像に変換
   * @param {File} file - PDFファイル
   * @param {function} onProgress - 進捗コールバック (currentPage, totalPages)
   * @returns {Promise<File[]>} 各ページの画像Fileオブジェクトの配列
   */
  static async extractPages(file, onProgress) {
    const arrayBuffer = await file.arrayBuffer();

    const pdf = await pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      // CMap設定（日本語PDFの文字マッピング用）
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4/cmaps/',
      cMapPacked: true,
    }).promise;

    const totalPages = pdf.numPages;
    const pageFiles = [];

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      if (onProgress) onProgress(pageNum, totalPages);

      const page = await pdf.getPage(pageNum);

      // 高解像度でレンダリング（OCR精度向上のため）
      const scale = 2.0;
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');

      await page.render({
        canvasContext: ctx,
        viewport: viewport,
      }).promise;

      // CanvasをPNG Blobに変換
      const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/png');
      });

      // BlobからFileオブジェクトを作成
      const baseName = file.name.replace(/\.pdf$/i, '');
      const pageFileName = `${baseName}_p${String(pageNum).padStart(3, '0')}.png`;
      const pageFile = new File([blob], pageFileName, { type: 'image/png' });

      pageFiles.push(pageFile);

      // メモリ解放
      page.cleanup();
      canvas.width = 0;
      canvas.height = 0;
    }

    pdf.destroy();
    return pageFiles;
  }

  /**
   * ファイルがPDFかどうかを判定
   */
  static isPDF(file) {
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  }
}
