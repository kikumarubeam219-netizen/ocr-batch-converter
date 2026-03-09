// ファイルマネージャモジュール - ファイル選択・管理・サムネイル生成

export class FileManager {
    constructor() {
        /** @type {File[]} */
        this.files = [];
        /** @type {Map<number, string>} index => thumbnail data URL */
        this.thumbnails = new Map();
    }

    /**
     * ファイルを追加
     * @param {FileList|File[]} fileList
     * @returns {number} 追加されたファイル数
     */
    addFiles(fileList) {
        const validTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/bmp', 'image/tiff', 'application/pdf'];
        let addedCount = 0;

        for (const file of fileList) {
            if (validTypes.includes(file.type) || /\.(png|jpe?g|webp|bmp|tiff?|gif|pdf)$/i.test(file.name)) {
                this.files.push(file);
                addedCount++;
            }
        }

        return addedCount;
    }

    /**
     * ファイルを全削除
     */
    clear() {
        this.files = [];
        this.thumbnails.clear();
    }

    /**
     * ファイル数を取得
     */
    get count() {
        return this.files.length;
    }

    /**
     * サムネイルを生成
     * @param {number} index
     * @param {number} maxSize - サムネイルの最大ピクセル
     * @returns {Promise<string>} data URL
     */
    async generateThumbnail(index, maxSize = 150) {
        if (this.thumbnails.has(index)) {
            return this.thumbnails.get(index);
        }

        const file = this.files[index];
        if (!file) return '';

        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let w = img.naturalWidth;
                    let h = img.naturalHeight;

                    if (w > h) {
                        if (w > maxSize) { h = (h * maxSize) / w; w = maxSize; }
                    } else {
                        if (h > maxSize) { w = (w * maxSize) / h; h = maxSize; }
                    }

                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);

                    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                    this.thumbnails.set(index, dataUrl);
                    resolve(dataUrl);
                };
                img.onerror = () => resolve('');
                img.src = e.target.result;
            };
            reader.onerror = () => resolve('');
            reader.readAsDataURL(file);
        });
    }

    /**
     * 全サムネイルを順次生成
     * @param {function} onGenerated - (index, dataUrl) コールバック
     */
    async generateAllThumbnails(onGenerated) {
        // バッチ処理で一度に5枚ずつ
        const batchSize = 5;
        for (let i = 0; i < this.files.length; i += batchSize) {
            const batch = [];
            for (let j = i; j < Math.min(i + batchSize, this.files.length); j++) {
                batch.push(
                    this.generateThumbnail(j).then(dataUrl => {
                        if (onGenerated) onGenerated(j, dataUrl);
                    })
                );
            }
            await Promise.all(batch);
        }
    }

    /**
     * ファイル名でソート
     */
    sortByName() {
        const indexed = this.files.map((f, i) => ({ file: f, origIndex: i }));
        indexed.sort((a, b) => a.file.name.localeCompare(b.file.name, 'ja'));
        this.files = indexed.map(i => i.file);
        this.thumbnails.clear();
    }

    /**
     * ファイルサイズの合計 (MB)
     */
    getTotalSizeMB() {
        const total = this.files.reduce((sum, f) => sum + f.size, 0);
        return (total / (1024 * 1024)).toFixed(1);
    }
}
