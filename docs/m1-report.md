# v0.2 M0/M1 进度报告

日期：2026-10-22
基线：`Graylight Sagas v0.1.0`（git 提交 `7581f7c`）

## M0 本地图像模型可行性（已通过）

- 模型：`E:\AIprogram\models\Qwen-Image-2.1`（31GB，diffusers `QwenImage21Pipeline`）
- venv：`E:\AIprogram\models\.venv-qwenimg`（torch 2.14.0+cu126，CUDA，RTX 4070 SUPER 12GB）
- 方案：bitsandbytes **4-bit** 量化 text_encoder + transformer，`enable_model_cpu_offload()`
- 实测：
  - 加载 42.9s（冒烟）/ 60.9s（批量）
  - 512×512、6 步：17.2s；768×416、22 步：60–120s/张
  - 显存峰值 **9.46GB**（12GB 卡内）
  - 原生 RGBA 输出可用（alpha 0–255），但背景带半透明雾，做棋子前需要 matte/阈值处理
- 产物：`tools/art/out/concepts/`（3 方向 × hero/mood + RGBA 头像 + contact sheet + report.json）
- 结论：**本地生成路线可行**，无需降级到 DGX 或远程 API。尺寸需为 32 的倍数（768×416 即被自动调整）。

## M1 平台数据与 API（已通过）

- SQLite 迁移 v2：`characters` 表；`campaigns` 新增 `pack_id / lifecycle / title / last_played_at / character_id`；旧行回填。
- 角色：`src/platform/characters.ts`（战士/游侠/牧师；属性 → HP/AC/攻击/伤害/技能/能力；zod 等价手写校验）。
- 世界：`src/platform/worlds.ts`（单世界描述符，公开世界书）。
- 内容库：`src/platform/library.ts`（怪物/NPC/道具/地图，只读）。
- 引擎：`abilityIds` + 能力注册表（`second_wind/heal/radiance/aimed_shot`），移除 `cleric/guardian` 特判；长休按能力恢复。
- API：
  - `GET /api/platform`、`GET /api/dashboard`
  - `GET/POST /api/campaigns`、`PATCH/DELETE /api/campaigns/:id`
  - `GET/POST /api/characters`、`GET/PATCH/DELETE /api/characters/:id`
  - `GET /api/worlds`、`GET /api/worlds/:id`
  - `GET /api/library`
- 兼容：旧 `POST /api/campaigns {name, playerName}` 仍可用；旧存档加载时补齐 `abilityIds`。

## 测试与冒烟

- `npm test`：**62 / 62 通过**（原 57 + 新增 5：角色派生、旧库迁移、平台 CRUD、世界/内容库、非法输入）。
- Windows/Node 24 冒烟（隔离数据目录）：
  - 创建游侠角色 → 战役 PC 为 `游侠`，HP 26、AC 15、攻击 +6、射程 12、`aimed_shot`
  - 归档后 active 为空、archived 可见；无 `confirm=1` 删除返回 400；确认后删除成功
  - 世界详情不含 `dmEntries`；内容库 6+ 怪物、2 NPC、5 地图

## 未完成

- 前端 shell/Dashboard/向导/角色页（M2–M3）
- VTT 视觉重构与正式素材（M4/M6）
- Playwright 本机未安装，浏览器自动化未执行
- 视觉方向待用户从 A/B/C 中选定
