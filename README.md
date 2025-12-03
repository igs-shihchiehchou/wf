# WaveForge 音效處理工具

### 線上使用
直接訪問 GitHub Pages 部署版本：
```
https://igs-shihchiehchou.github.io/wf/
```

### 本地開發

1. **克隆專案**
```bash
git clone https://github.com/igs-shihchiehchou/wf.git
cd audio-webtool
```

2. **啟動本地伺服器**

使用 Python（推薦）：
```bash
python -m http.server 8000
```

或使用其他方式：
```bash
# Node.js
npx http-server -p 8000

# PHP
php -S localhost:8000

# VS Code Live Server
# 安裝 Live Server 擴充功能，右鍵點擊 index.html → Open with Live Server
```

3. **在瀏覽器開啟**
```
http://localhost:8000
```


## 致謝

- [Tone.js](https://tonejs.github.io/) - 音訊處理函式庫
- [WaveSurfer.js](https://wavesurfer-js.org/) - 波形視覺化
- [Tailwind CSS](https://tailwindcss.com/) - CSS 框架

