# v0.2 验收记录

日期：2026-10-22
环境：Windows 11、Node.js 24.19、Edge（headless + CDP）、本机 SQLite

## 自动化测试

| 测试 | 命令 | 结果 |
|---|---|---|
| 规则 / 存档 / HTTP / 平台 API | `npm test` | **62 / 62 通过** |
| 真实浏览器流程 | `npm run test:browser` | **15 / 15 通过** |

浏览器测试覆盖：工作台渲染、创建向导四步、创建后进入跑团页、头像棋子加载、动作面板、战役列表、归档/恢复、设置页、世界详情、390px 工作台/跑团页无横向溢出、控制台无错误。测试会在没有 Edge 的机器上自动跳过。

## 三档截图

截图位于 `docs/screenshots/v2/`，原始报告见 `docs/acceptance-v0.2-report.json`。

| 屏幕 | 1440×900 | 1024×768 | 390×844 |
|---|---|---|---|
| 工作台 | `dashboard-1440.webp` | `dashboard-1024.webp` | `dashboard-390.webp` |
| 战役详情 | `campaign-1440.webp` | `campaign-1024.webp` | `campaign-390.webp` |
| 创建向导 | `wizard-1440.webp` | `wizard-1024.webp` | `wizard-390.webp` |
| 跑团页 | `play-1440.webp` | `play-1024.webp` | `play-390.webp` |
| 战役列表 / 角色 / 世界 / 内容库 / 设置 | 1440 各一张 | — | — |

## 实测结论

- 全部 18 张截图：`document.scrollWidth <= innerWidth`，无横向溢出。
- 跑团页 3 张截图：图片全部加载成功（`naturalWidth > 0`）。
- 工作台在 1024px 下自动变为两列统计 + 单列侧栏；390px 下侧栏折叠为顶部图标行。
- 跑团页在 390px 下堆叠为「地图 → 动作 → 剧情」，顶栏隐藏状态徽标，按钮不换行。
- 视觉基线：中性石墨/冷钢外壳；《无声钟塔》世界使用黄铜强调色与暗色地牢底图；角色棋子使用本地生成头像。

## 已知缺口

1. 世界库目前只有一个世界；内容包与第二世界未进入 v0.2。
2. 跑团页尚无命中/受伤浮动反馈、射程/AoE 预览、NPC 地图头像。
3. 浏览器测试依赖本机 Edge；无 Playwright 跨浏览器覆盖。
4. 真实模型（DGX/Qwen 文本）未做 20 次兼容性验收；本轮测试使用 mock provider。
5. 无障碍只做了基础焦点样式与可访问名称，未做完整 axe/对比度审计。

## 合并后补充（feat/multigame-hall-wrath-experimental）

- 一级入口 `/games`：灰灯 d20（legacy）与「黑井中继站」D6 实验模块并列。
- D6 模块使用独立 API `/api/games/wrath-d6-experiment/*`、独立 SQLite 与 Web 界面 `/games/wrath-d6-experiment`；原 d20 战役与存档不迁移。
- 合并后回归：`npm test` **68 / 68 通过**（新增 6 项 D6/目录隔离测试）；`npm run test:browser` 15 / 15 通过。
- 手工冒烟：创建 D6 会话 → 结束回合 → 导出存档 → 页面 200；`/api/games` 与两个模块页面均可访问。
- 截图：`docs/screenshots/v2/games-1440.webp`、`wrath-1440.webp`。
