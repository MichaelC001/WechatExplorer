# macOS 关闭 SIP 教程

SIP（System Integrity Protection，系统完整性保护）是 macOS 的系统安全机制。关闭 SIP 会降低系统安全性，只建议在确实需要读取或调试本地微信数据时临时关闭；操作完成后，建议重新开启。

## 准备

- 一台 Mac 电脑，Intel 芯片和 Apple Silicon 芯片均可。
- 需要进入 macOS 恢复模式。
- 请先保存正在编辑的文件，并预留一次重启时间。

## 关闭 SIP

### Intel Mac

1. 关机。
2. 按下开机键后，立刻按住 `Command + R`。
3. 保持按住，直到进入 macOS 恢复模式。

### Apple Silicon Mac（M1/M2/M3/M4）

1. 关机。
2. 长按开机键不放。
3. 直到出现启动选项界面后松开。
4. 选择“选项”，进入 macOS 恢复模式。

### 在恢复模式中执行命令

1. 进入恢复模式后，点击顶部菜单栏的 **Utilities（实用工具）**。
2. 选择 **Terminal（终端）**。
3. 在终端中输入：

```bash
csrutil disable
```

4. 按回车执行。
5. 看到关闭成功提示后，重启电脑。

## 重新开启 SIP

如果后续不再需要关闭 SIP，建议重新进入恢复模式，在终端中执行：

```bash
csrutil enable
```

然后重启电脑。
