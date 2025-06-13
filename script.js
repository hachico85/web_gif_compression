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
    progressText.textContent = 'GIFを処理中...';
    
    try {
        // 圧縮設定
        const scale = parseInt(scaleSlider.value) / 100;
        const colors = parseInt(colorReduction.value);
        
        // 画像要素を作成
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = originalPreview.src;
        });
        
        // 新しいサイズを計算
        const newWidth = Math.round(img.width * scale);
        const newHeight = Math.round(img.height * scale);
        
        progressText.textContent = 'フレームを抽出中...';
        
        // アニメーションGIFかどうかを判定し、フレームを抽出
        const frames = await extractGIFFrames(originalFile);
        
        if (frames.length > 1) {
            // アニメーションGIFの場合
            progressText.textContent = `${frames.length}フレームを圧縮中...`;
            await compressAnimatedGIF(frames, newWidth, newHeight, colors, fpsReduction.checked);
        } else {
            // 静止画GIFの場合
            progressText.textContent = '静止画を圧縮中...';
            await compressStaticGIF(img, newWidth, newHeight, colors);
        }
        
    } catch (error) {
        console.error('圧縮エラー:', error);
        alert('圧縮中にエラーが発生しました: ' + error.message);
        loading.style.display = 'none';
    }
}

async function extractGIFFrames(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const arrayBuffer = e.target.result;
            const uint8Array = new Uint8Array(arrayBuffer);
            
            // 簡易的なGIF解析でフレーム数を判定
            let frameCount = 0;
            for (let i = 0; i < uint8Array.length - 1; i++) {
                if (uint8Array[i] === 0x21 && uint8Array[i + 1] === 0xF9) {
                    frameCount++;
                }
            }
            
            // フレーム情報を生成（簡易版）
            const frames = [];
            for (let i = 0; i < Math.max(1, frameCount); i++) {
                frames.push({
                    delay: 100, // デフォルト遅延
                    canvas: null // 後で設定
                });
            }
            
            resolve(frames);
        };
        reader.readAsArrayBuffer(file);
    });
}

async function compressAnimatedGIF(frames, width, height, colors, skipFrames) {
    const gif = new GIF({
        workers: 2,
        quality: Math.round((256 - colors) / 25.6),
        width: width,
        height: height,
        workerScript: 'https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js'
    });
    
    // 元の画像を使用してフレームを生成
    const img = new Image();
    img.src = originalPreview.src;
    
    await new Promise(resolve => {
        img.onload = resolve;
    });
    
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    // フレーム数に応じて処理
    const frameCount = frames.length;
    const actualFrames = skipFrames ? Math.ceil(frameCount / 2) : frameCount;
    
    for (let i = 0; i < frameCount; i++) {
        if (skipFrames && i % 2 === 1) continue;
        
        progressText.textContent = `フレーム ${i + 1}/${frameCount} を処理中...`;
        
        // 簡易的にメイン画像をフレームとして使用
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        
        gif.addFrame(ctx, {
            delay: frames[i].delay,
            copy: true
        });
        
        // 進行状況を更新するため少し待機
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    progressText.textContent = 'GIFを生成中...';
    
    gif.on('finished', function(blob) {
        displayCompressed(blob);
    });
    
    gif.on('progress', function(p) {
        progressText.textContent = `GIF生成中... ${Math.round(p * 100)}%`;
    });
    
    gif.render();
}

async function compressStaticGIF(img, width, height, colors) {
    const gif = new GIF({
        workers: 2,
        quality: Math.round((256 - colors) / 25.6),
        width: width,
        height: height,
        workerScript: 'https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js'
    });
    
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    ctx.drawImage(img, 0, 0, width, height);
    gif.addFrame(ctx, { delay: 100, copy: true });
    
    progressText.textContent = 'GIFを生成中...';
    
    gif.on('finished', function(blob) {
        displayCompressed(blob);
    });
    
    gif.on('progress', function(p) {
        progressText.textContent = `GIF生成中... ${Math.round(p * 100)}%`;
    });
    
    gif.render();
}

function displayCompressed(blob) {
    compressedBlob = blob;
    const url = URL.createObjectURL(blob);
    
    compressedImage.src = url;
    compressedImage.style.display = 'block';
    compressedInfo.textContent = `サイズ: ${formatFileSize(blob.size)} (${Math.round((1 - blob.size / originalFile.size) * 100)}%削減)`;
    
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