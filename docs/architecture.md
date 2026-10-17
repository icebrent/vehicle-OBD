# 架构与文件布局

## 数据管线

原始输入统一为 CANFrame：Transport 读取线程 → 有界 Capture 队列 → ID 分析 / NDJSON 存储 / WebSocket 批次 → 虚拟化表格和 ECharts。Raw CAN 固定使用 Generic 配置，没有车型选择入口。

- `backend/transports/`：OBDLink、Replay；未来增加 SocketCAN / PCAN 不改变前端帧协议。
- `backend/protocols/obdlink.py`：串口文本解析，区分 11/29-bit ID、DLC 和 RTR。
- `backend/capture/service.py`：生命周期、背压、统计、记录与展示分发。
- `backend/storage/sessions.py`：原始 CAN 索引与 NDJSON；`exporters.py` 预留导出格式接口。
- `backend/analysis/aggregate.py`：通道 / ID / IDE / RTR 聚合与字节变化。
- `backend/vehicles/` 与 `vehicles/`：仅保留 Generic / Raw CAN 元数据与预留 Decoder 接口；没有 DBC 或车型专用解码实现。

Vehicle 车型目录位于 `backend/vehicles/diagnostic_profiles.py`，独立于 Raw CAN 的 Generic 配置。实时读取与回放请求必须明确给出 vehicle_profile_id；回放先校验 definition_version，状态返回当前车型身份。前端默认不选车型，仅对所选车型与状态身份一致的数据进行展示，不回填其他解码器的结果。

诊断读取是独立管线：`protocols/byd_did.py` 固定白名单 → `capture/diagnostics.py` 单一读取线程 → `storage/diagnostics.py` 独立 SQLite / NDJSON → `/api/vehicle/*` → `frontend/src/vehicle/`。诊断响应包含协议封装，不被伪装成原始 CANFrame。诊断与原始工作台不能同时占用适配器。

`analysis/diagnostics.py` 与 `scripts/analyze_diagnostics.py` 提供离线描述性统计。动作备注与读数分文件持久化；不靠电流猜测挡位。

## 类型与时间

Python bytes 在 CAN JSON 中表示为无分隔符大写 HEX。支持 Classical CAN DLC 0–8；低数值扩展 ID 仍由 IDE 明确区分。时间为 PC 接收 UTC 和单调时间，不是硬件总线时间。测试合成帧明确标记 simulation。原始回放保留来源标识；诊断回放保留原始时间戳及定义版本。

前端 `types.ts` 定义原始 API/WS 类型；`vehicle/live.ts` 定义诊断类型与有界历史重建。后端接口使用 Pydantic schema。

## 容量与背压

- 原始线程队列默认 8192，满时丢弃新帧并累计 queue_drops。
- 最多 4096 个原始身份，LRU 淘汰可见；每 ID 频率窗口有界。
- WS 默认 10 批/秒，待推送最多 2048 帧，每浏览器最多 2 批。展示丢弃不等于存储丢帧。
- 原始图表每 ID 最多 600 点、60 秒；诊断历史最多 360 条响应。
- SQLite 与 NDJSON 不是跨文件原子事务；启动时未完成会话标为 interrupted。保存失败会报告，断电可能损失最后未持久化部分。
- 审计文件持续增长，需要操作者按需归档；不提供自动删除实车数据的任务。

环境变量：CAN_DATA_DIR、CAN_QUEUE_SIZE、CAN_WS_INTERVAL（0.05–2 秒）、CAN_ENABLE_HARDWARE、CAN_DEFAULT_SOURCE。`.env.example` 不自动加载。开发后端与前端只绑定 localhost，同目录只允许一个后端实例。

测试脚本每次创建独立 .cache/test-runs 临时与 pytest 缓存目录，避免不同执行身份或并发运行复用旧临时目录时的访问冲突。
