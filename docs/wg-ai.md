# W&G 本地 AI 配置

当前使用 OpenAI 兼容端点，无 API key。

```text
baseUrl: https://hk.guation.cn/v1
model:   DeepSeek-v4.1-Flash-1017-EXL3
apiKey:  (空)
extraBody: { "enable_thinking": false }
```

- `/v1/models` 返回：`DeepSeek-v4.1-Flash-1017-EXL3`、`DeepSeek-v4.1-Flash-EXL3`、`model`。
- `enable_thinking: false` 通过 `extraBody` 传给模型；当前端点接受该字段。没有它时，较长请求可能返回 `reasoning_content`。
- 设置文件在 `data/settings.json`（git 忽略）。界面「设置 → AI」也能改。
- 连通性检查：`POST /api/ai/ping`（服务端读取当前设置）。
- 当前 W&G 页面尚未调用 AI；AI GM 工具层是 Gate D。

## 图像

- 封面由本地 `Qwen-Image-2.1` 生成：`tools/art/wg_cover.py`。
- 模型目录：`E:/AIprogram/models/Qwen-Image-2.1`，环境 `.venv-qwenimg`，4-bit nf4 + CPU offload。
- 输出：`tools/art/out/wg-cover.png`（git 忽略），转 webp 后放 `public/games/wrath-glory/art/graveyard-shift.webp`。
- PDF 插画只用于本地私有包；公开仓库不提交官方插画。
