# CAN Observatory

Windows 本地 CAN 原始监听、实验性只读诊断、记录与离线回放工作台。Python 3.12 / FastAPI / PySerial / Pydantic / SQLite；React / TypeScript / Vite / Tailwind CSS / ECharts / TanStack Virtual。MIT License。

默认运行 Mock，不需要车辆或适配器。界面为英文，主题默认跟随系统，图标按钮支持 Light / Dark / System。默认不保存数据；保存需要手动开始。

## 安装与启动

要求 Windows 10/11、PowerShell 7、Node.js 22.12+、npm，以及 uv 或 Python 3.12。不需要 Docker 或 WSL。以下命令均从克隆后的项目根目录执行。

```powershell
pwsh -NoLogo -NoProfile -File .\scripts\setup.ps1
```

在两个终端分别启动：

```powershell
pwsh -NoLogo -NoProfile -File .\scripts\start-backend.ps1
```

```powershell
pwsh -NoLogo -NoProfile -File .\scripts\start-frontend.ps1
```

- 原始工作台：http://127.0.0.1:5173/
- 车辆 Mock 演示：http://127.0.0.1:5173/?view=vehicle
- 真实诊断 / 离线回放：http://127.0.0.1:5173/?view=vehicle&source=live
- API 文档：http://127.0.0.1:8000/docs

底层命令：根目录运行 `.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000`；另一终端进入 `frontend` 运行 `npm.cmd run dev`。

`.env.example` 仅是模板，脚本不自动加载 `.env`；需要时在终端设置 `$env:CAN_DATA_DIR='自选本地目录'`。配置与容量边界见 [架构说明](docs/architecture.md)。同一数据目录只运行一个后端实例。服务仅绑定 localhost，无多用户认证，不应直接暴露到局域网或公网。

## 三种使用方式

| 模式 | 输入与用途 | 车辆通信 |
| --- | --- | --- |
| 原始 CAN | Mock / OBDLink MX+ / 历史帧 Replay；ID 聚合、频率、字节高亮、原始字节曲线 | MX+ 使用 STM 16 被动采样，存在采样间隙 |
| Vehicle Mock | 浏览器本地模拟；车辆示意图、分组检查、物理量选择和曲线 | 无 |
| Vehicle DID / Replay | 固定白名单只读 DID 或本地诊断记录回放 | 真实模式主动发送固定读取请求；Replay 无硬件访问 |

两个工作台属于同一 React 应用。车型配置与采集通道独立；Generic 模式也能完整采集原始 CAN。选择车型不会连接设备或发送请求。未知值显示空缺，不用 Mock 填补真实数据。

## 真实设备

以 `scripts/start-hardware.ps1` 替代普通后端启动脚本，启用硬件入口，但不会自动打开 COM、开始读取或保存。端口由操作者手动选择，不能依赖旧 COM 号；蓝牙已配对不等于串口链路可用。

原始监听人工选择 CAN 速率。固定 STM 16 每批最多 16 帧，正常结束后等待默认 1 秒再监听，属于有间隙采样，不能视为完整无损总线记录。只支持 Classical CAN 0–8 字节，不支持 CAN FD。

实验性车辆诊断目前提供公开 BYD 候选配置：固定 11-bit / 500 kbps，地址 7E7 → 7EF，核心 DID 0005 / 0008 / 0009 / 0032。可选 10 个候选电池分组的 40 项读取。它是主动只读诊断，与被动监听白名单分离；不扫描 ECU 或 DID、不读取 VIN、不清码、不做会话切换、安全访问或 ECU 写入。没有任意串口命令或通用 CAN 发送 API。

DID 每次响应后等待 0.5 秒，使用单条预期响应后缀；开启分组时四项核心与一组四项交错轮询。实际速度取决于 ECU 和蓝牙延迟。核心值超过 45 秒、分组任一字段超过 120 秒时隐藏。分组需四字段完整才显示；温度为候选 A/B，物理位置和换算仍待验证。转速、扭矩、挡位未映射。派生电功率来自顺序电压电流样本，不能视为电机机械功率。

连接成功后不要为加载代码自行断开串口或重启后端；需要断开时先取得操作者同意。错误会停止读取并报告，不自动重连。错误 121、BUFFER FULL 等限制见 [蓝牙排查](docs/bluetooth-troubleshooting.md)、[命令边界](docs/adapter-safety.md)及 [硬件验证](docs/hardware-validation.md)。

## 保存、离线回放和分析

保存按钮或 `Save after first response` 控制诊断记录，默认关闭。后台记录不依赖浏览器连接。原始帧与诊断响应使用独立格式，不伪造 CAN 帧字段。完整回放步骤、数据目录、备份和导出限制见 [回放指南](docs/replay.md)。

只回放诊断记录时，后端无需启用硬件：

```powershell
$env:CAN_ENABLE_HARDWARE='0'
$env:CAN_AUTOSTART_MOCK='0'
pwsh -NoLogo -NoProfile -File .\scripts\start-backend.ps1
```

打开车辆 DID / Replay 页，展开 `Diagnostic recordings / replay`，找到已完成的记录并点击 `Replay`。无需选择 COM、配对或给车辆通电。回放保留原始时间戳；历史画面上较早的日期不代表连接了车辆。

保存时可用 `Stationary / Forward / Reverse / A/C on / A/C off` 添加人工时间标记，仅写本机备注。由乘员或停车后操作；标记可能有延迟，不是 ECU 挡位或空调状态测量。

离线生成描述性统计：

```powershell
.\.venv\Scripts\python.exe -m scripts.analyze_diagnostics RECORDING_UUID --output data\analysis.json
```

## 目录

```text
backend/       api / transports / capture / protocols / storage / analysis / vehicles
frontend/      src/components / charts / state / vehicle，以及 e2e
vehicles/      通用与实验性车型配置，无个人车辆身份信息
tests/         Python 单元及集成测试
scripts/       安装、启动、测试、离线分析、提交隐私检查
docs/          架构、状态、安全、硬件、回放与隐私说明
data/          本地记录、数据库、报告及 private 文档，全部忽略（仅保留 .gitkeep）
```

缓存、Python 运行时、虚拟环境、node_modules、构建与截图保留在各自工具目录并由 Git 忽略，不搬动运行依赖，不删除测试数据。

## 检查

```powershell
pwsh -NoLogo -NoProfile -File .\scripts\test.ps1
.\.venv\Scripts\python.exe scripts\check_repository_privacy.py
```

检查脚本依次运行 Ruff、pytest、Prettier、Vitest、TypeScript/Vite build、Playwright；浏览器测试使用隔离的 8001 / 5174 端口与 `.cache/e2e-data`，硬件关闭。持续运行 Mock 检查可运行 `python scripts/soak.py --seconds 60`，它不操作设备。

状态与未验证项见 [项目状态](docs/status.md)、[验证范围](docs/validation.md)。提交隐私检查需要文件已暂存；它是辅助检查，不能替代人工审阅。实车日志、个人报告、设备身份、VIN、截图与数据索引不得推送，详见 [隐私约定](docs/privacy.md)。
