# 记录、回放与备份

## 诊断物理量回放

1. 从项目根目录在一个 PowerShell 7 终端设置 `$env:CAN_ENABLE_HARDWARE='0'`，运行 `pwsh -NoLogo -NoProfile -File .\scripts\start-backend.ps1`。
2. 第二个终端运行 `pwsh -NoLogo -NoProfile -File .\scripts\start-frontend.ps1`。
3. 打开 http://127.0.0.1:5173/?view=vehicle&source=live 。先在 `Vehicle model` 选择对应车型，再在 `Data source` 下拉菜单选择 `Replay`。
4. 从 `Diagnostic recording` 下拉菜单直接选择记录，再点击 `Start`；无需选择 COM 或连接车辆。可用 `Stop` 中断回放，Pause display 仅暂停展示。
5. 浏览器使用原始记录时间重建曲线，早期四项记录不会出现没有采集过的分组。分组不完整或过期时显示缺失。

API：`POST /api/vehicle/replay`，正文 `{"vehicle_profile_id":"byd-dolphin-jp","recording_id":"记录 UUID","speed":1}`。未选车型时 Start 弹出提示，不发送回放请求；记录 definition_version 必须与所选车型匹配。速度支持 0.5 / 1 / 2 / 5；当前 UI 使用 1 倍。活动记录需先 Stop saving 或 Stop 才能导出/回放；对真实连接执行停止前先取得操作者同意。

## 原始 CAN 回放

在原始工作台将 `Data source` 切到 `Replay`，从 `Raw CAN recording` 下拉菜单选取记录，再点击 `Load replay` 和 `Start`；也可从历史会话直接回放。它与诊断 DID 格式不同，不能将诊断响应文件作为原始 CAN 导入。原始回放使用 Replay Transport，保留原始 payload 和来源信息。

## 文件与备份

```text
data/
  sessions.sqlite3            原始 CAN 索引
  <uuid>.ndjson               原始 CAN 帧（若有保存）
  audit.ndjson                本机诊断审计，可能包含敏感原始行
  diagnostics/
    index.sqlite3             DID 记录索引
    <uuid>.ndjson             完整响应、数值、单位、组号、PC 时间与定义版本
    <uuid>.events.ndjson      历史人工动作备注（不再新增）
  private/                    私有测试清单、报告与旧文档
```

诊断备份应同时保留整个 `data/diagnostics/`，特别是 index.sqlite3、NDJSON 和 events 旁文件。当前没有 UI 文件导入/重建索引功能。网页 Export NDJSON 只导出读数，不包含事件文件或数据库。

推荐在完成记录、关闭后端后备份整个 data 目录；备份进行中的 SQLite 数据库需使用 SQLite backup API，不能仅复制主文件忽略日志。不要把备份放入可提交源码目录。公开仓库和新克隆不会自带私人记录。

## 分析

根目录执行：

```powershell
.\.venv\Scripts\python.exe -m scripts.analyze_diagnostics RECORDING_UUID --output data\analysis.json
```

脚本读取默认 data/diagnostics 下的记录与同名 events。输出各字段数量、极值、均值、中位数、首末变化与实际采样间隔，以及人工标记之间的分段统计。标记误差、采样间隔和混杂负载会影响解释；统计不自动宣称因果，不推测转速、扭矩或挡位。使用自定义 CAN_DATA_DIR 时，本脚本暂需将记录放在默认目录或自行调整分析入口。
