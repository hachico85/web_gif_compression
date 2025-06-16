const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const previewSection = document.getElementById('previewSection');
const originalPreview = document.getElementById('originalPreview');
const compressedImage = document.getElementById('compressedImage');
const originalInfo = document.getElementById('originalInfo');
const compressedInfo = document.getElementById('compressedInfo');
const colorReduction = document.getElementById('colorReduction');
const scaleSlider = document.getElementById('scaleSlider');
const scaleValue = document.getElementById('scaleValue');
const fpsReduction = document.getElementById('fpsReduction');
const compressBtn = document.getElementById('compressBtn');
const downloadBtn = document.getElementById('downloadBtn');
const resetBtn = document.getElementById('resetBtn');
const loading = document.getElementById('loading');
const progressText = document.getElementById('progressText');

let originalFile = null;
let compressedBlob = null;

uploadArea.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileSelect);

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragging');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragging');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragging');
    
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type === 'image/gif') {
        handleFile(files[0]);
    }
});

scaleSlider.addEventListener('input', (e) => {
    scaleValue.textContent = e.target.value;
});

compressBtn.addEventListener('click', compressGIF);
downloadBtn.addEventListener('click', downloadCompressed);
resetBtn.addEventListener('click', reset);

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file && file.type === 'image/gif') {
        handleFile(file);
    }
}

function handleFile(file) {
    originalFile = file;
    const reader = new FileReader();
    
    reader.onload = (e) => {
        originalPreview.src = e.target.result;
        originalInfo.textContent = `サイズ: ${formatFileSize(file.size)}`;
        previewSection.style.display = 'block';
        uploadArea.style.display = 'none';
    };
    
    reader.readAsDataURL(file);
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function compressGIF() {
    if (!originalFile) return;
    
    loading.style.display = 'block';
    compressedImage.style.display = 'none';
    downloadBtn.style.display = 'none';
    progressText.textContent = 'GIFを解析中...';
    
    try {
        // 圧縮設定
        const scale = parseInt(scaleSlider.value) / 100;
        const colors = parseInt(colorReduction.value);
        
        // 画像を読み込む
        const img = new Image();
        img.src = originalPreview.src;
        
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
        });
        
        const newWidth = Math.round(img.width * scale);
        const newHeight = Math.round(img.height * scale);
        
        progressText.textContent = 'GIFを圧縮中...';
        
        // gif.jsの品質パラメータ: 1が最高品質、10が最低品質
        const quality = Math.max(1, Math.round(10 - (colors / 256) * 9));
        
        console.log(`圧縮設定: サイズ ${scale * 100}%, 色数 ${colors}, 品質 ${quality}`);
        
        const gif = new GIF({
            workers: 2,
            quality: quality,
            width: newWidth,
            height: newHeight,
            workerScript: './gif.worker.js',
            dither: false,
            globalPalette: true,
            background: '#fff',
            transparent: null
        });
        
        // キャンバスを作成
        const canvas = document.createElement('canvas');
        canvas.width = newWidth;
        canvas.height = newHeight;
        const ctx = canvas.getContext('2d');
        
        // 背景を白にする
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, newWidth, newHeight);
        
        // 画像を描画
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, newWidth, newHeight);
        
        // 色数を削減
        if (colors < 256) {
            const imageData = ctx.getImageData(0, 0, newWidth, newHeight);
            const reducedData = reduceColors(imageData, colors);
            ctx.putImageData(reducedData, 0, 0);
        }
        
        // GIFに追加
        gif.addFrame(ctx, { delay: 100, copy: true });
        
        gif.on('finished', function(blob) {
            console.log('圧縮完了:', blob.size, 'bytes');
            displayCompressed(blob);
        });
        
        gif.on('progress', function(p) {
            progressText.textContent = `GIF生成中... ${Math.round(p * 100)}%`;
        });
        
        gif.render();
        
    } catch (error) {
        console.error('圧縮エラー:', error);
        let errorMessage = 'エラーが発生しました';
        
        if (error.message) {
            errorMessage = error.message;
        } else if (error.toString) {
            errorMessage = error.toString();
        }
        
        alert(`圧縮中にエラーが発生しました:\n${errorMessage}\n\n詳細はコンソールを確認してください。`);
        loading.style.display = 'none';
    }
}

// 色数を削減する関数（改良版）
function reduceColors(imageData, maxColors) {
    const data = imageData.data;
    
    // カラーパレットを作成
    const colorMap = new Map();
    
    // すべてのピクセルの色を収集
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const key = `${r},${g},${b}`;
        
        colorMap.set(key, (colorMap.get(key) || 0) + 1);
    }
    
    // 色の使用頻度でソート
    const sortedColors = Array.from(colorMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, maxColors)
        .map(([color]) => color.split(',').map(Number));
    
    // 各ピクセルを最も近い色に置き換え
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // 最も近い色を見つける
        let minDistance = Infinity;
        let nearestColor = sortedColors[0];
        
        for (const color of sortedColors) {
            const distance = Math.sqrt(
                Math.pow(r - color[0], 2) +
                Math.pow(g - color[1], 2) +
                Math.pow(b - color[2], 2)
            );
            
            if (distance < minDistance) {
                minDistance = distance;
                nearestColor = color;
            }
        }
        
        data[i] = nearestColor[0];
        data[i + 1] = nearestColor[1];
        data[i + 2] = nearestColor[2];
    }
    
    return imageData;
}

function displayCompressed(blob) {
    compressedBlob = blob;
    const url = URL.createObjectURL(blob);
    
    compressedImage.src = url;
    compressedImage.style.display = 'block';
    
    const reduction = Math.round((1 - blob.size / originalFile.size) * 100);
    const reductionText = reduction > 0 ? `${reduction}%削減` : `${Math.abs(reduction)}%増加`;
    
    compressedInfo.textContent = `サイズ: ${formatFileSize(blob.size)} (${reductionText})`;
    
    loading.style.display = 'none';
    downloadBtn.style.display = 'inline-block';
    progressText.textContent = '';
}

function downloadCompressed() {
    if (!compressedBlob) return;
    
    const link = document.createElement('a');
    const url = URL.createObjectURL(compressedBlob);
    
    link.href = url;
    link.download = `compressed_${originalFile.name}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
}

function reset() {
    originalFile = null;
    compressedBlob = null;
    
    fileInput.value = '';
    previewSection.style.display = 'none';
    uploadArea.style.display = 'block';
    
    originalPreview.src = '';
    compressedImage.src = '';
    originalInfo.textContent = '';
    compressedInfo.textContent = '';
    
    colorReduction.value = '128';
    scaleSlider.value = 100;
    scaleValue.textContent = '100';
    fpsReduction.checked = false;
    
    loading.style.display = 'none';
    compressedImage.style.display = 'none';
    downloadBtn.style.display = 'none';
    progressText.textContent = '';
}