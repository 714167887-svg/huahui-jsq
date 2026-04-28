# HUAHUI 淋浴房计算器（打样版本）

> 沐新 jsq 几何算法的衍生项目，专门给 HUAHUI 客户打样使用。

## 当前作用域

| 项目 | 状态 |
|---|---|
| 款式 | 仅 **HY-050**（开门 · 转轴） |
| 房型 | 仅 **钻石型** |
| 偏移 | `stone_base = -13`, `sink_top = 32`, `stone_center = 14` |
| 模块 | 计算器 + 玻璃尺寸预览 |
| 不含 | 品牌 logo、下单(bom)、其它款型 |

## 目录结构

```
HUAHUI/
├── index.html              # 入口（无品牌 logo）
├── 111.html                # 计算器主页面（钻石型 / HY-050）
├── functions/
│   ├── _lib/
│   │   ├── protected-calc.js   # 几何算法（HY-050 单款）
│   │   └── model-catalog.js    # 款式目录
│   └── api/
│       ├── calc.js             # POST /api/calc 备用云端入口
│       └── catalog.js          # GET  /api/catalog 公开款式列表
└── glass/
    └── catalog.json        # 玻璃下单尺寸公式
```

> 当前 `111.html` 直接 import 本地 `protected-calc.js`，**无需** Cloudflare Functions 也能跑。`functions/api/*` 仅在部署到 Cloudflare Pages 时启用。

## 本地预览

任选其一：

```powershell
# 1) Python（系统已自带）
cd C:\Users\Administrator\Desktop\HUAHUI
python -m http.server 8765
# 浏览器打开 http://127.0.0.1:8765/

# 2) Cloudflare Wrangler（带 Functions）
cd C:\Users\Administrator\Desktop\HUAHUI
npx wrangler pages dev . --port 8765
```

## 算法关键值（HY-050）

```js
"HY-050": {
  stone_base: -13,    // 石材基座内缩 mm
  sink_top:   32,     // 水槽顶外凸 mm
  stone_center: 14,   // 石材中线偏移 mm
  doorType:  "hinged",
  pivotType: "pivot",
}
```

材料尺寸 = 墙体三段经过偏移裁剪后的导轨长度。详见 [functions/_lib/protected-calc.js](functions/_lib/protected-calc.js)。

## 玻璃公式

`glass/catalog.json` 中 `panels[].widthFormula` 和 `heightFormula` 支持的占位符：

| 占位符 | 含义 |
|---|---|
| `总高` | 用户在页面上输入的玻璃总高 |
| `材料` | 当前 segment（l / c / r）的材料尺寸 |

公式仅允许 `+ - * / ( )` 与数字。

## 后续扩款指南

1. 在 [functions/_lib/protected-calc.js](functions/_lib/protected-calc.js) 的 `MODEL_OFFSETS` 增加新条目；
2. 在 [functions/_lib/model-catalog.js](functions/_lib/model-catalog.js) 的 `MODEL_CATALOG` 增加同名条目；
3. 在 [glass/catalog.json](glass/catalog.json) 增加 `entries[]`；
4. 如需 L 型 / 一字型房型，需要把 jsq 的对应 `calculateLShapeMetrics` / `calculateInlineMetrics` 移植回来。
