+++
title = "T5 备份与救援盘"
date = 2026-09-06
type = "handbook"
form = "note"
kicker = "Samsung Portable SSD T5 · 465.8 GB"
summary = "接收 CachyOS 的 Btrfs 增量快照，兼一个能联网、能修盘的独立 Arch 救援环境。插上即自动备份，完成后自动上锁"
tags = ["Btrfs", "备份", "Linux"]
+++

<dl class="hb-id"><div><dt>设备序列号</dt><dd>S49ZNV0KC02636F</dd></div><div><dt>接口</dt><dd>USB · /dev/sda</dd></div><div><dt>建立日期</dt><dd>2026-09-06</dd></div><div><dt>状态</dt><dd>已验证可启动</dd></div></dl>

## 分区布局

<div class="hb-map"><div class="hb-bar"><div class="hb-seg esp"><span>ESP</span></div><div class="hb-seg rescue"><span>RESCUE</span></div><div class="hb-seg backup"><span>BACKUP · LUKS2</span></div></div><div class="hb-legend"><div style="--sw: var(--c-key)"><span class="part">sda1 · T5ESP</span><span class="size">1 GB</span><span class="desc">FAT32。systemd-boot 装在这里，含 <code>EFI/BOOT/BOOTX64.EFI</code> 可移动介质回退路径 —— 任何 UEFI 固件插上就能识别，无需写 NVRAM。当前占用 7%</span></div><div style="--sw: var(--c-str)"><span class="part">sda2 · T5-RESCUE</span><span class="size">32 GB</span><span class="desc">ext4，不加密。完整 Arch Linux + LTS 内核，装有全套文件系统、分区、数据恢复工具与极简图形界面。当前占用 4.6 GB</span></div><div style="--sw: var(--accent)"><span class="part">sda3 · LUKS2 → btrfs</span><span class="size">432.8 GB</span><span class="desc">加密备份区，内层 btrfs 元数据双份（<code>-m dup</code>）、zstd:3 压缩。btrbk 的 send/receive 接收端。首次全量后占用 15 GB</span></div></div><div class="hb-scale">↑ 色条宽度为示意，1 GB 按真实比例仅占 0.21% 无法显示；实际容量以标注为准</div></div>

## 日常操作

插上 T5 就会自动备份 —— udev 检测到 LUKS 分区 UUID，触发 `t5-backup.service`，跑完自动卸载上锁并弹桌面通知。下面这些是需要手动介入时用的

| 命令 | 作用 |
| --- | --- |
| `sudo t5 status` | 插入状态、解锁状态、挂载点、上次备份时间 |
| `sudo t5 backup` | 立即备份一次。跳过 30 分钟去重限制 |
| `sudo t5 unlock` | 只解锁挂载到 `/mnt/t5-backup`，翻文件用，不备份 |
| `sudo t5 lock` | 卸载并上锁。拔盘前用 |
| `sudo t5 list` | 列出 T5 上已有的备份快照 |

<div class="hb-note"><strong>30 分钟去重</strong><p>自动触发的备份在 30 分钟内只跑一次。反复插拔时看到「30 分钟内已备份过，跳过」是正常的，不是故障。要强制跑就用 <code>sudo t5 backup</code></p></div>

## 备份了什么

| 源子卷 | 备份名 | 内置盘保留 | T5 上保留 |
| --- | --- | --- | --- |
| `@` | `rootfs.<时间戳>` | 7 天 | 30d 10w 12m |
| `@home` | `home.<时间戳>` | 7 天 | 30d 10w 12m |

内置盘上那份是中转快照，只为算增量，所以留得短。T5 上保留 30 天 + 10 周 + 12 个月

### 与 snapper 的分工

- **snapper + Limine** —— 手滑或更新翻车时秒回滚。`root` 配置由 snap-pac 在每次 pacman 事务时打快照；`home` 配置每小时打一次，保留 6 时 / 7 天 / 4 周。快照直接在 Limine 启动菜单里可选
- **btrbk + T5** —— 内置 NVMe 物理损坏时的灾难恢复。两套快照互不干扰，btrbk 用自己的一套算增量

## 恢复

### 情形一 · 只想找回几个文件

备份快照是普通只读目录，直接 `cp` 就行

```bash
sudo t5 unlock
ls /mnt/t5-backup/btrbk/            # 挑一个时间戳
cp /mnt/t5-backup/btrbk/home.20260906T2029/bdathe/文件 ~/
sudo t5 lock
```

### 情形二 · 系统更新后崩了，内置盘还好

不用碰 T5。开机在 Limine 菜单里选一个 pacman 事务前的 snapper 快照启动，进去后回滚即可

### 情形三 · 内置盘换新 / 子卷整个损坏

必须从救援盘启动 —— 运行中的系统无法替换自己的 `@home`。以恢复 `@home` 为例：

```bash
# 1. 解锁备份区（输入你设的 LUKS 密码）
cryptsetup open /dev/disk/by-uuid/c8b600f8-76c4-45cf-a0f8-4020583586c8 t5backup
mkdir -p /mnt/backup && mount -o compress=zstd:3 /dev/mapper/t5backup /mnt/backup

# 2. 挂载内置池的顶层
mkdir -p /mnt/pool && mount -o subvolid=5 /dev/nvme0n1p2 /mnt/pool

# 3. 把坏的挪开，收回备份
mv /mnt/pool/@home /mnt/pool/@home.broken
btrfs send /mnt/backup/btrbk/home.20260906T2029 | btrfs receive /mnt/pool/
mv /mnt/pool/home.20260906T2029 /mnt/pool/@home
btrfs property set /mnt/pool/@home ro false

# 4. 确认无误后再删 @home.broken
```

## 救援系统

开机按 **F12** 选 USB 设备。T5 插着正常开机不会抢启动 —— 固件 BootOrder 第一位仍是 Limine，因为刻意没写任何 UEFI 变量。进去后自动以 root 登录 tty1

| 命令 | 作用 |
| --- | --- |
| `cat ~/RESCUE.md` | 盘内速查表，含本页的恢复命令 |
| `nmcli device wifi connect "SSID" password "PW"` | 联网。本机只有无线网卡 RTL8852AE |
| `niri` | 启动图形界面。Mod+T 终端 / Mod+D 启动器 / Mod+B 浏览器 / Mod+Shift+E 退出 |
| `arch-chroot /mnt/sys` | 挂载主系统后进去修（挂载步骤见 RESCUE.md） |

### 三个刻意为之的设计

- **屏蔽了 NVIDIA 独显**，只用 AMD 核显。独显驱动是救援系统最常见的翻车点，而 amdgpu 在内核里开箱即用。启动项里另有一个 `safe graphics` 条目带 `nomodeset` 兜底
- **initramfs 去掉了 autodetect**，因此是 40 MB 而非 15 MB。autodetect 会把 initramfs 裁剪到构建时那一台机器的硬件上，插到别的机器就起不来 —— 这跟机器新旧无关
- **只有一个 initramfs，没有 fallback**。现在的 Arch 默认就不生成 fallback，而且去掉 autodetect 后 default 镜像本身就是通用镜像，fallback 的作用（`-S autodetect`）已经内含

<div class="hb-note"><strong>需要定期维护</strong><p>救援系统几个月不开机就会积累大量过期包，真出事时 <code>pacman -Syu</code> 可能因为 keyring 太旧而失败。建议每隔两三个月启动一次，联网跑一遍更新。也可以从主系统里 <code>sudo t5 unlock</code> 后 chroot 进去更新</p></div>

## 加密与密钥

| 密钥槽 | 凭据 | 位置 | 用途 |
| --- | --- | --- | --- |
| 0 | 4096-bit keyfile | `/etc/cryptsetup-keys.d/t5-backup.key` | 主系统自动解锁，`0400 root:root` |
| 1 | 人工密码 | 密码管理器 | 救援系统里手动解锁 |

<div class="hb-note"><strong>keyfile 只存在内置盘上</strong><p>如果内置 NVMe 彻底损坏，keyfile 随之消失，<b>那个人工密码就是打开备份区的唯一途径</b>。确认它在密码管理器里，且能在没有这台电脑的情况下取到。这是整套方案里唯一的单点故障</p></div>

## 速查

| 对象 | 标识 |
| --- | --- |
| T5 备份区 LUKS | `c8b600f8-76c4-45cf-a0f8-4020583586c8` |
| T5 救援系统 root | `13a9f387-60e5-4bc5-9016-8b3359c236f7` |
| T5 ESP | `8B4C-09C8` |
| 内置 btrfs 池 | `ed01bd55-f05b-49b0-846e-78776dfc43f1` |
| t5 命令 | `/usr/local/bin/t5` |
| btrbk 配置 | `/etc/btrbk/btrbk.conf` |
| btrbk 日志 | `/var/log/btrbk.log` |
| udev 触发规则 | `/etc/udev/rules.d/99-t5-backup.rules` |
| 自动备份服务 | `/etc/systemd/system/t5-backup.service` |
| 中转快照目录 | `/mnt/btr_pool/btrbk_snapshots` |
| UEFI 启动项备份 | `/root/efibootmgr-backup-*.txt` |

排查自动备份为什么没跑：`journalctl -u t5-backup -n 50`

---

CachyOS · Niri · Limine　|　救援盘 Arch linux-lts 6.18.49　|　首次全量 20 GB → 15 GB，用时 84 秒
