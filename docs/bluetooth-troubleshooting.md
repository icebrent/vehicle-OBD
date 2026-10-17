# Windows Bluetooth COM 排查

配对成功只表示系统认识设备，不保证应用已打开 SPP 链路。COM 号可能在重新配对后改变；在 Windows 设备管理器核对目标适配器的出站端口，不轮流向不明端口发送命令。设备身份和地址只保存在本机，不写入仓库。

Windows 121 是 ERROR_SEM_TIMEOUT。它可能发生在打开串口阶段，不能据此断言其他设备占用、CAN 速率错误或驱动损坏。链路距离、遮挡、无线干扰、省电、驱动、设备供电与其他连接均是待排查因素。命令提示符超时不控制 Windows 打开端口的系统等待。

操作者可按顺序确认供电、观察指示灯、核对出站端口和应用占用，再按官方步骤短按 Pair 或重新配对。不要擅自恢复出厂、更新驱动、删除系统设备或给适配器断电。重新配对后的偶发成功不证明根因已经解决。

蓝牙链路错误与 BUFFER FULL 分开处理：后者为适配器输出缓冲事件，不能仅归因于浏览器。当前使用紧凑输出、有界 STM 16 与批量读取减轻吞吐压力，但有采样间隙；异常停止后不自动重试。

连接成功后，任何主动断开串口或重启后端都需先得到操作者同意，避免破坏难以恢复的链路。

参考：[Microsoft 错误码](https://learn.microsoft.com/en-us/windows/win32/debug/system-error-codes--0-499-)；[OBDLink Windows 指南](https://support.obdlink.com/support/solutions/articles/43000706058-resolve-bluetooth-connection-issues-on-windows-11)；[OBDLink LED](https://support.obdlink.com/support/solutions/articles/43000722033-understand-obdlink-bluetooth-adapter-leds)。
