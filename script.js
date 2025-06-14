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
        
        // GIFファイルを解析
        const arrayBuffer = await originalFile.arrayBuffer();
        const gif = gifuctJs.parseGIF(arrayBuffer);
        const frames = gifuctJs.decompressFrames(gif, true);
        
        console.log('解析されたフレーム数:', frames.length);
        
        if (frames.length > 1) {
            // アニメーションGIFの場合
            progressText.textContent = `${frames.length}フレームを圧縮中...`;
            await compressAnimatedGIF(frames, scale, colors, fpsReduction.checked);
        } else {
            // 静止画GIFの場合
            progressText.textContent = '静止画を圧縮中...';
            const img = new Image();
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = originalPreview.src;
            });
            const newWidth = Math.round(img.width * scale);
            const newHeight = Math.round(img.height * scale);
            await compressStaticGIF(img, newWidth, newHeight, colors);
        }
        
    } catch (error) {
        console.error('圧縮エラー:', error);
        alert('圧縮中にエラーが発生しました: ' + error.message);
        loading.style.display = 'none';
    }
}

async function compressAnimatedGIF(frames, scale, colors, skipFrames) {
    // 最初のフレームからサイズを取得
    const firstFrame = frames[0];
    const newWidth = Math.round(firstFrame.dims.width * scale);
    const newHeight = Math.round(firstFrame.dims.height * scale);
    
    // gif.jsの品質パラメータ: 1が最高品質、10が最低品質
    const quality = Math.max(1, Math.round(10 - (colors / 256) * 9));
    
    const gif = new GIF({
        workers: 2,
        quality: quality,
        width: newWidth,
        height: newHeight,
        workerScript: './gif.worker.js',
        dither: false,
        globalPalette: true
    });
    
    const canvas = document.createElement('canvas');
    canvas.width = newWidth;
    canvas.height = newHeight;
    const ctx = canvas.getContext('2d');
    
    // フレームを処理
    const processedFrames = skipFrames ? frames.filter((_, i) => i % 2 === 0) : frames;
    
    console.log('処理するフレーム数:', processedFrames.length);
    
    for (let i = 0; i < processedFrames.length; i++) {
        const frame = processedFrames[i];
        progressText.textContent = `フレーム ${i + 1}/${processedFrames.length} を処理中...`;
        
        // フレームを描画用のImageDataに変換
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = frame.dims.width;
        tempCanvas.height = frame.dims.height;
        const tempCtx = tempCanvas.getContext('2d');
        
        const imageData = tempCtx.createImageData(frame.dims.width, frame.dims.height);
        imageData.data.set(frame.patch);
        tempCtx.putImageData(imageData, 0, 0);
        
        // スケールして描画
        ctx.clearRect(0, 0, newWidth, newHeight);
        ctx.drawImage(tempCanvas, 0, 0, frame.dims.width, frame.dims.height, 0, 0, newWidth, newHeight);
        
        // 色数を削減
        if (colors < 256) {
            const scaledImageData = ctx.getImageData(0, 0, newWidth, newHeight);
            const reducedData = reduceColors(scaledImageData, colors);
            ctx.putImageData(reducedData, 0, 0);
        }
        
        // フレームレートを調整（skipFramesの場合は遅延を2倍に）
        const delay = skipFrames ? frame.delay * 2 : frame.delay;
        
        console.log(`フレーム ${i + 1}: 遅延 ${delay}ms`);
        
        gif.addFrame(ctx, {
            delay: delay,
            copy: true
        });
        
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
    // gif.jsの品質パラメータ: 1が最高品質、10が最低品質
    const quality = Math.max(1, Math.round(10 - (colors / 256) * 9));
    
    const gif = new GIF({
        workers: 2,
        quality: quality,
        width: width,
        height: height,
        workerScript: './gif.worker.js',
        dither: false,
        globalPalette: true
    });
    
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    // 画像の品質を調整
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);
    
    // 色数を削減
    if (colors < 256) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const reducedData = reduceColors(imageData, colors);
        ctx.putImageData(reducedData, 0, 0);
    }
    
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

// 色数を削減する関数
function reduceColors(imageData, maxColors) {
    const data = imageData.data;
    const factor = 256 / Math.pow(maxColors, 1/3);
    
    for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.round(data[i] / factor) * factor;     // R
        data[i + 1] = Math.round(data[i + 1] / factor) * factor; // G
        data[i + 2] = Math.round(data[i + 2] / factor) * factor; // B
    }
    
    return imageData;
}

function displayCompressed(blob) {
    compressedBlob = blob;
    const url = URL.createObjectURL(blob);
    
    console.log('圧縮後のファイルサイズ:', blob.size);
    console.log('圧縮後のURL:', url);
    
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