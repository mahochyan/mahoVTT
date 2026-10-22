# v0.1 构建与测试记录

日期：2026-10-22。环境：Linux x64、Node.js v22.16.0、TypeScript 5.8.3、系统 Chromium、Python Playwright。测试使用隔离临时目录和本地模拟 OpenAI 接口，不连接用户 DGX。

## 已执行

|检查|结果|边界|
|---|---|---|
|严格 TypeScript 编译|通过|预编译 dist 随包提供|
|Node 自动化|57 / 57 通过|规则、数据库、HTTP、模拟模型协议|
|Chromium UI 交互|6 / 6 通过，0 页面异常|隔离 HTTP 传输桥，不是原生浏览器直连网络|
|完整冒险|多个固定随机种子完成|规则策略演算，不是大模型实玩|
|断流/500/非法 JSON|按预期拒绝或保留结算|本地真实 HTTP 模拟接口|
|强制 SIGKILL|已提交不丢，未提交不污染|实际子进程退出与重启|
|导出导入|规范状态与记录校验通过|示例导入为新副本|
|移动宽度|390px 无横向溢出|不代表全面移动端兼容认证|

57 项分组：规则 30、Store 14、HTTP 13。浏览器 6 条包括建战役、委托与自由输入、手动修正版本冲突、直接攻击、叙事失败重试不重掷、玩家世界书与移动布局。

## 浏览器测试方法说明

构建环境的浏览器网络策略禁止直接导航。没有更改此策略。使用 Playwright 加载真实网页源码，再把 fetch 通过 Python 转发给真实隔离应用服务器，验证实际 UI 事件与服务端状态。

因此本次浏览器传输不验证真实浏览器网络连接、原生 SSE 分片时序或本机导航策略；这些不能宣称为已经通过。HTTP、SSE 分片解析、UTF-8、进程恢复由独立 Node 测试验证。tests/e2e.py 默认支持原生浏览器网络，在普通本机环境可直接再次执行。

## 复现命令

```text
npm test
npm run verify
npm install
npm run build
python -m pip install playwright requests
python -m playwright install chromium
python tests/e2e.py
```

本构建环境执行浏览器时额外设置 SAGAS_TEST_BRIDGE=1 和 CHROMIUM_EXECUTABLE=/usr/bin/chromium；普通本机不应默认使用桥接。

## 未完成，不能视作已验收

1. 用户 Windows 与 Node 24 原生启动实测。
2. 双 DGX / TensorFold / 1017 EXL3 2.9bpw 的真实模型兼容性、延迟与 20 次计划测试。
3. 连续三小时人工游玩。
4. 完整 Shaping Sagas 对标、完整 5e、生产级长期稳定性。
5. 零叙事幻觉保证。模型文字可能偏离事实，但不能写入游戏状态。

原计划的最终 M5 尚不能标记完成。本包交付的是可运行、已做上述实测的 v0.1，而不是未测试的框架模板。

## 压缩包独立启动复核

将发布 ZIP 解压到新的临时目录，在没有 node_modules、没有开发数据库、没有环境密钥的情况下直接运行 dist/server.js。已验证首页与脚本返回、创建角色、接受委托、SSE 完成、状态版本增长及 verify 脚本。此复核仍在 Linux/Node22.16 环境，不替代 Windows 实机测试。原始结果见 release-smoke-test.json。
