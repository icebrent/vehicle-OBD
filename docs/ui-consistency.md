# 两页 UI 一致性约定

以原 Raw CAN 页的紧凑工具栏为基准，不新增大型操作面板或 Options 浮层。

| 项目 | 统一方式 |
| --- | --- |
| 页面外壳 | 共用标题栏、导航、主题按钮，内容最大宽度 1760px，桌面左右内边距 30px |
| 标题栏下状态行 | 状态 → 来源 → 连接信息 → 数据数量 → 保存状态 → 时间戳；不放长说明段落 |
| Source 卡片 | 共用紧凑容器；数据源、Vehicle 专属车型选择、端口/记录、相关设置、操作在桌面单行排列，窄屏换行 |
| 下拉菜单 | 固定数据源/端口字段宽度，记录字段在可用空间内伸缩；长选项不撑动布局 |
| 刷新 | 共用图标按钮，提供无障碍名称与悬停标题，不混用文字 Refresh |
| 主操作 | Start / Stop，分别使用播放/停止图标；具体动作通过数据源和悬停标题说明 |
| 保存 | Start saving / Stop saving；记录名统一称 Recording name |
| 暂停显示 | Pause display / Resume display；与后端 Start / Stop 分开 |
| 导出 | Export NDJSON 与下载图标 |
| 信号展示 | 曲线和悬停列表顺序跟随 Signals；计算值带 CALC 标识；缺失值仍为 — |
| 辅助文字 | 删除重复协议、操作指引和装饰性说明；保留单位、数据来源及实验性/未知标记 |

功能差异仍如实保留：Raw CAN 有 Connect / Disconnect 和 CAN / 串口速率；Vehicle 的 DID 读取包含自动连接与固定白名单，并保留 Auto-save、Battery groups 和记录名设置。两类回放记录各自独立。

本次已按真实浏览器画面检查深浅主题、1440/1600px 桌面与 390px 窄屏；验证长端口描述刷新后布局保持不变，以及 Live / Replay 选择不会改变数据源字段宽度。截图保留在本机 `data/private/ui-audit/`，由 Git 忽略。

Vehicle model 默认留空。空车型时不解码、不显示专属图示；点击 Start 弹出提示且不调用 API。所选车型、运行状态的 vehicle_profile_id、记录 definition_version 必须明确匹配，不从 Raw CAN 的 Generic 配置或历史数字推断。
