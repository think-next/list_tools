# Chrome Web Store - 权限使用说明

## 请求的权限

- **`tabs`**: 用于在新标签页中打开链接

## 为什么需要 tabs 权限？

### 核心功能支持

**List Tools** 的核心单一用途是：**为地理空间开发提供专业的 H3 网格索引计算和管理工具**

tabs 权限是扩展核心功能的必要组成部分，具体原因如下：

### 1. 自定义工具管理功能

扩展允许用户添加和管理自定义的在线工具链接。当用户点击这些工具时，需要在新的浏览器标签页中打开这些链接。

**使用场景**：
- 用户添加了常用的地理工具网站链接
- 用户从扩展的快速访问工具集点击某个工具
- 扩展需要以编程方式打开新标签页

**代码使用位置**：
```javascript
// ext/src/popup.js - 用户点击自定义工具时
handleCustomToolClick(tool) {
  chrome.tabs.create({ url: tool.url });
}
```

### 2. 权限使用范围

tabs 权限仅用于：
- ✅ 当用户主动点击自定义工具时，在新标签页打开链接
- ❌ 不会读取或修改任何标签页内容
- ❌ 不会访问标签页的 DOM 或数据
- ❌ 不会监控或记录用户的浏览行为

### 3. 最小权限原则

我们采用最小权限原则：
- 仅请求实现核心功能所需的最小权限
- 不读取用户浏览历史或标签页内容
- 仅当用户主动操作时使用该权限

### 4. 与单一用途的关系

自定义工具管理功能是 H3 网格索引计算器的重要组成部分：
- **主功能**：H3 网格索引计算和数据分析
- **辅助功能**：用户可以将计算结果导出、添加到其他工具，或快速访问相关的地理工具
- **整合性**：这些工具通常是 GIS 分析工具链的一部分，允许用户无缝在计算器和其他专业工具之间切换

### 5. 用户体验

不使用 tabs 权限的话，用户需要：
1. 看到工具链接
2. 手动复制链接
3. 打开新标签页
4. 粘贴链接并访问

使用 tabs 权限后：
1. 点击工具
2. 直接跳转到目标页面

这提供了更加流畅和专业的用户体验，符合工具集应有的便利性。

## 隐私保护

- **本地存储**：所有自定义工具链接仅存储在用户的本地浏览器中
- **无数据收集**：不收集、不上传用户添加的任何工具链接或访问记录
- **用户控制**：用户完全控制添加、删除哪些工具
- **透明使用**：权限仅在用户明确操作时使用（点击自定义工具）

## 总结

**tabs 权限的必要性**：
1. ✅ 支持扩展的核心功能（自定义工具管理）
2. ✅ 提供专业、流畅的用户体验
3. ✅ 符合最小权限原则
4. ✅ 确保隐私安全（不监控、不读取用户浏览行为）

**使用目的**：当用户点击他们添加的自定义工具时，在新标签页中打开该工具的链接。

---

## Chrome Web Store 审核说明

**权限使用说明**（Chrome Web Store 后台填写）：

"The 'tabs' permission is required to open custom tool links in new browser tabs when users click on tools they've added to their collection. This is an essential part of the extension's tool management feature, allowing users to seamlessly access their frequently-used geospatial tools from within the extension. We do not read, modify, or monitor any tab content or browsing behavior - we only open new tabs when the user actively clicks on a custom tool."

**翻译（中文）**：

"'tabs' 权限用于在用户点击已添加的自定义工具时，在新浏览器标签页中打开工具链接。这是扩展程序工具管理功能的重要组成部分，允许用户从扩展程序内无缝访问他们常用的地理空间工具。我们不会读取、修改或监控任何标签页内容或浏览行为——仅在用户主动点击自定义工具时打开新标签页。"

