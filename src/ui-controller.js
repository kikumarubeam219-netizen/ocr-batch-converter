// UIコントローラモジュール - UI状態管理・DOM操作

export class UIController {
    constructor() {
        // DOM要素のキャッシュ
        this.els = {
            // セクション
            sectionUpload: document.getElementById('section-upload'),
            sectionSettings: document.getElementById('section-settings'),
            sectionFilelist: document.getElementById('section-filelist'),
            sectionProgress: document.getElementById('section-progress'),
            sectionActions: document.getElementById('section-actions'),
            sectionComplete: document.getElementById('section-complete'),

            // ドロップゾーン
            dropzone: document.getElementById('dropzone'),
            fileInput: document.getElementById('file-input'),

            // ファイルリスト
            filelist: document.getElementById('filelist'),
            fileCountLabel: document.getElementById('file-count-label'),

            // ボタン
            btnClear: document.getElementById('btn-clear'),
            btnAddMore: document.getElementById('btn-add-more'),
            btnStartOcr: document.getElementById('btn-start-ocr'),
            btnGeneratePdf: document.getElementById('btn-generate-pdf'),
            btnDownload: document.getElementById('btn-download'),
            btnCancel: document.getElementById('btn-cancel'),

            // 進捗
            progressText: document.getElementById('progress-text'),
            progressPercent: document.getElementById('progress-percent'),
            progressFill: document.getElementById('progress-fill'),
            progressElapsed: document.getElementById('progress-elapsed'),
            progressEta: document.getElementById('progress-eta'),
            currentFile: document.getElementById('current-file'),
            currentFileName: document.getElementById('current-file-name'),

            // ステップ
            step1: document.getElementById('step-indicator-1'),
            step2: document.getElementById('step-indicator-2'),
            step3: document.getElementById('step-indicator-3'),

            // 完了
            completionText: document.getElementById('completion-text'),

            // トースト
            toastContainer: document.getElementById('toast-container'),

            // 設定
            ocrLang: document.getElementById('ocr-lang'),
            pdfQuality: document.getElementById('pdf-quality'),
            workerCount: document.getElementById('worker-count'),
            pageSize: document.getElementById('page-size'),
        };
    }

    // --- セクション表示制御 ---

    // ステップ1: ファイル選択後 → PDF生成ボタンを表示
    showFilelist() {
        this.els.sectionSettings.style.display = '';
        this.els.sectionFilelist.style.display = '';
        this.els.sectionActions.style.display = '';
        this.els.btnGeneratePdf.style.display = '';
        this.els.btnStartOcr.style.display = 'none';
        this.els.btnDownload.style.display = 'none';
        this.els.btnCancel.style.display = 'none';
        this.els.sectionComplete.style.display = 'none';
    }

    // ステップ2: PDF生成中
    showPdfProcessing() {
        this.els.sectionProgress.style.display = '';
        this.els.btnGeneratePdf.style.display = 'none';
        this.els.btnStartOcr.style.display = 'none';
        this.els.btnCancel.style.display = '';
        this.els.btnDownload.style.display = 'none';
        this.els.currentFile.style.display = '';
        this.setStep(2);
    }

    // ステップ2完了 → OCR開始ボタンを表示
    showOcrReady() {
        this.els.btnGeneratePdf.style.display = 'none';
        this.els.btnCancel.style.display = 'none';
        this.els.btnStartOcr.style.display = '';
        this.els.btnDownload.style.display = '';
        this.els.currentFile.style.display = 'none';
        this.els.sectionComplete.style.display = '';
    }

    // ステップ3: OCR処理中
    showOcrProcessing() {
        this.els.sectionProgress.style.display = '';
        this.els.btnStartOcr.style.display = 'none';
        this.els.btnCancel.style.display = '';
        this.els.btnGeneratePdf.style.display = 'none';
        this.els.btnDownload.style.display = 'none';
        this.els.currentFile.style.display = '';
        this.els.sectionComplete.style.display = 'none';
        this.setStep(3);
    }

    // 全処理完了 → ダウンロードボタン表示
    showDownloadReady() {
        this.els.btnGeneratePdf.style.display = 'none';
        this.els.btnStartOcr.style.display = 'none';
        this.els.btnDownload.style.display = '';
        this.els.btnCancel.style.display = 'none';
        this.els.sectionComplete.style.display = '';
    }

    hideAll() {
        this.els.sectionSettings.style.display = 'none';
        this.els.sectionFilelist.style.display = 'none';
        this.els.sectionProgress.style.display = 'none';
        this.els.sectionActions.style.display = 'none';
        this.els.sectionComplete.style.display = 'none';
    }

    // --- ステップインジケータ ---

    setStep(stepNum) {
        const steps = [this.els.step1, this.els.step2, this.els.step3];
        steps.forEach((step, i) => {
            step.classList.remove('active', 'completed');
            if (i + 1 < stepNum) {
                step.classList.add('completed');
            } else if (i + 1 === stepNum) {
                step.classList.add('active');
            }
        });
    }

    // --- ファイルリスト ---

    renderFileList(files, thumbnails) {
        this.els.filelist.innerHTML = '';
        this.els.fileCountLabel.textContent = `ファイル一覧（${files.length}件）`;

        for (let i = 0; i < files.length; i++) {
            const item = document.createElement('div');
            item.className = 'file-item';
            item.id = `file-item-${i}`;

            const thumb = thumbnails.get(i) || '';
            const thumbImg = thumb
                ? `<img class="file-item__thumb" src="${thumb}" alt="${files[i].name}" loading="lazy" />`
                : `<div class="file-item__thumb" style="background:var(--bg-secondary);display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:0.7rem;">読込中</div>`;

            item.innerHTML = `
        ${thumbImg}
        <div class="file-item__overlay">
          <div class="file-item__name" title="${files[i].name}">${files[i].name}</div>
        </div>
        <div class="file-item__status file-item__status--pending" id="file-status-${i}">⏳</div>
      `;

            this.els.filelist.appendChild(item);
        }
    }

    updateFileThumbnail(index, dataUrl) {
        const item = document.getElementById(`file-item-${index}`);
        if (!item) return;
        const thumb = item.querySelector('.file-item__thumb');
        if (thumb && thumb.tagName !== 'IMG') {
            const img = document.createElement('img');
            img.className = 'file-item__thumb';
            img.src = dataUrl;
            img.loading = 'lazy';
            thumb.replaceWith(img);
        }
    }

    setFileStatus(index, status) {
        const el = document.getElementById(`file-status-${index}`);
        if (!el) return;

        el.className = 'file-item__status';
        switch (status) {
            case 'processing':
                el.classList.add('file-item__status--processing');
                el.textContent = '⚡';
                break;
            case 'done':
                el.classList.add('file-item__status--done');
                el.textContent = '✓';
                break;
            case 'error':
                el.classList.add('file-item__status--error');
                el.textContent = '✕';
                break;
            default:
                el.classList.add('file-item__status--pending');
                el.textContent = '⏳';
        }
    }

    // --- 進捗バー ---

    updateProgress(current, total) {
        const percent = total > 0 ? Math.round((current / total) * 100) : 0;
        this.els.progressText.textContent = `${current} / ${total} ファイル完了`;
        this.els.progressPercent.textContent = `${percent}%`;
        this.els.progressFill.style.width = `${percent}%`;
    }

    updateProgressInfo(elapsed, eta) {
        this.els.progressElapsed.textContent = `経過時間: ${elapsed}`;
        this.els.progressEta.textContent = `残り時間: ${eta}`;
    }

    setCurrentFile(name) {
        this.els.currentFileName.textContent = name;
    }

    // --- 完了メッセージ ---

    setCompletionText(text) {
        this.els.completionText.textContent = text;
    }

    // --- トースト通知 ---

    showToast(message, type = 'info', duration = 4000) {
        const toast = document.createElement('div');
        toast.className = `toast toast--${type}`;

        const icons = {
            info: 'ℹ️',
            success: '✅',
            error: '❌',
            warning: '⚠️',
        };

        toast.textContent = `${icons[type] || ''} ${message}`;
        this.els.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('toast-exit');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    // --- 設定値の取得 ---

    getSettings() {
        return {
            lang: this.els.ocrLang.value,
            quality: parseFloat(this.els.pdfQuality.value),
            workerCount: parseInt(this.els.workerCount.value, 10),
            pageSize: this.els.pageSize.value,
        };
    }

    // --- ボタン有効化制御 ---

    setButtonsDisabled(disabled) {
        this.els.btnStartOcr.disabled = disabled;
        this.els.btnClear.disabled = disabled;
        this.els.btnAddMore.disabled = disabled;
        // 設定フォームの無効化
        this.els.ocrLang.disabled = disabled;
        this.els.pdfQuality.disabled = disabled;
        this.els.workerCount.disabled = disabled;
        this.els.pageSize.disabled = disabled;
    }
}
