# List Tools (Chrome Extension)

A simple Chrome Extension (MV3) to compute H3 index from latitude/longitude and resolution using `h3-js`.

## 使用方法

1. 安装依赖（已在项目中完成一次，可跳过）：
   ```bash
   cd /Users/fuhui/Code/src/github.com/think-next/h3index
   npm install
   ```

2. 加载扩展：
   - 打开 Chrome，访问 `chrome://extensions/`
   - 右上角打开「开发者模式」
   - 点击「加载已解压的扩展程序」
   - 选择目录：`/Users/fuhui/Code/src/github.com/think-next/h3index/ext`

3. 使用：
   - 点击浏览器工具栏中的扩展图标
   - 在弹出的页面中输入纬度、经度和分辨率（0-15）
   - 点击「Compute」，即可看到计算得到的 H3 cell（十六进制索引）和中心点坐标，及其上一级父单元（若分辨率>0）

## 开发说明

- 清单文件：`ext/manifest.json`
- 弹窗页面：`ext/popup.html`、`ext/popup.css`
- 逻辑脚本：`ext/src/popup.js`
- h3 库（ESM 版本，已本地化）：`ext/vendor/h3.browser.mjs`

如需进一步展示边界、下级网格等，可在 `ext/src/popup.js` 中从 `ext/vendor/h3.browser.mjs` 里按需引入 `cellToBoundary`、`cellToChildren` 等函数。
