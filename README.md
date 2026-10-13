# Soft Egg Twin · 手心里的蛋蛋

基于原有 Three.js / WebGPU 软蛋项目，加入**摄像头位置跟随 + 多区域 USB 压力输入**。实体蛋无需旋转：手带着蛋移动时，屏幕里的蛋跟随移动；捏、握紧和轻触路径会驱动局部形变、暖色光晕和表情。

默认进入「实体连接」模式。没有硬件时可以直接使用区域滑块和「捏一下 / 握紧 / 抚摸」示例；「鼠标实验室」保留原来的抓取、回弹、不倒翁和勺子交互。

## 本地启动

```bash
# Node.js 24，pnpm 11
pnpm install --frozen-lockfile
pnpm dev
```

打开终端给出的 localhost 地址。需要支持 **WebGPU** 的浏览器；**USB 串口请使用桌面 Chrome / Edge**。摄像头需要 localhost 或 HTTPS，点击按钮后由浏览器请求权限。

首次启动/构建会下载固定版本的 MediaPipe 手部模型，校验 SHA-256，并把 npm 包内的 WASM 复制到本地静态目录。下载完成后摄像头模型无需 CDN；视频与压力数据在浏览器内处理，不上传服务器。模型下载地址需网络可达。不要直接双击 `index.html`。

## 怎么用

1. 先点「捏一下 / 握紧 / 抚摸」，或拖动六个示例区域滑块，查看反馈。
2. 点「开启摄像头」，单手握蛋置于画面中央，识别到的第一帧作为位置原点。需要时点「当前位置归中」。只映射二维位置，不推算蛋的旋转或真实空间深度。
3. 在「测点与校准」导入你们的测点配置。默认六区、12 位 ADC（0–4095）只是示例，并不意味着硬件已匹配。
4. 点「连接 USB 串口」，选设备；串口占用时先关闭 Arduino 串口监视器。连接后区域滑块变成硬件读数。
5. 轻握实体蛋，点「以当前握持校零」。配置保存在当前浏览器本地，也可导出。
6. 断开 USB 后回到模拟输入。切到鼠标实验室或离开页面会关闭摄像头和串口。

## USB 协议

**115200 baud；UTF-8；每行一个完整 JSON，以 `\n` 结束。建议约 50 Hz。** 每帧必须包含配置中的全部测点；可以按 id 命名，也可以按配置顺序发数组。

原始 ADC 值：

```json
{"pressure":{"top":120,"left":580,"front":1100,"right":650,"back":90,"base":100},"normalized":false}
```

或由固件完成归一化：

```json
{"pressure":[0.05,0.2,0.8,0.2,0,0],"normalized":true}
```

`normalized` 默认为 `false`。原始值按每区 `(value - baseline) / (maximum - baseline)` 处理，裁剪到 0–1。归一化包必须已经在 0–1，且不能使用原始值校零。压力值应随受力增大；反向电路应在固件中转换。

- [12 位示例配置](examples/sensors-12bit.json)
- [Arduino Uno/Nano 10 位示例配置](examples/sensors-arduino-10bit.json)
- [Arduino USB 示例固件](hardware/egg_pressure_usb.ino)：A0–A5 → top / left / front / right / back / base；未针对你们的实际电路编译或烧录。
- [数据包示例](examples/pressure.ndjson)
- [接线、配置与识别边界](docs/hardware.md)

默认 750 ms 没收到有效完整帧，动作状态回到等待、压力形变逐渐释放。错误 JSON、缺测点、非数值和超长行被丢弃。断开连接会清除当前输入，防止一直“被捏住”。

## 测点配置

支持 1–32 个测点，每区包含 `id`、`label`、`position`、`baseline`、`maximum`。`position` 是蛋本地坐标：x/z 为 -1～1，y 为 0～1，程序映射到最近的表面点。默认正面大致朝向 +z。固定握持朝向才能让实体测点与屏幕区域相符；位置追踪不会估算朝向。

`baudRate` 和 `staleMs` 也在配置里。导入配置前先断开串口。测点名称仅作为文本展示。

## 反馈与能力边界

- **位置：** MediaPipe 的掌根/掌指关节中心作为实体蛋的位置代理，镜像、平滑后映射到屏幕平面。遮挡或未检测到手时保持最后位置。它不是精确的蛋体追踪，也没有旋转和真实深度测量。
- **形变：** 多测点压力映射为有界的局部表面凹陷，叠加在原有软体表面上；松开后平滑恢复，局部暖色提示接触。该层是艺术化反馈，未标定为牛顿、毫米或真实外壳形变；原实验室的物理体积读数不代表这层视觉形变。
- **动作：** 高局部压力 → 捏；多个区域持续高压 → 握紧；三个相邻区域的低压连续转移 → 抚摸候选。阈值为原型启发式，未在真实用户/传感器上验证。重新握持、外壳受力串扰可能被误判为抚摸。
- **摄像头：** 本机约 15 Hz 推理，画面独立插值；当前推理在主线程，较慢电脑可能掉帧。握蛋遮挡效果、延迟与不同光照需要实测。
- **硬件：** 已实现 Web Serial 接入与断线处理，自动测试使用模拟串口流。实际传感器、串口权限、摄像头实拍与固件尚需现场联调。

## 开发与验证

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm preview
```

自动测试覆盖原有软体行为，以及压力包完整性、分包/超长包、独立校零、断流释放、动作区分、追踪丢失、有界形变、表情和串口生命周期。GitHub Actions 自动执行测试和构建。

GitHub Pages 工作流只支持手动触发；此仓库默认私有，未开启公共站点。`.openai/hosting.json` 不用于本项目，以免误连接原模板的托管身份。

## 代码入口

- `src/twin/controller.ts`：交互模式、压力源、连接状态与 UI。
- `src/twin/pressure.ts`：协议解析、归一化、滤波和动作判断。
- `src/twin/camera.ts` / `tracking.ts`：摄像头、MediaPipe、位置映射。
- `src/twin/deformation.ts`：测点到蛋表面形变与触碰高亮。
- `src/scene/world.ts` / `face.ts`：原软蛋场景和表情，接入新反馈。

## 来源

在本机已改为蛋形的版本上继续开发；上游为 [Aimer779/pudding-lab](https://github.com/Aimer779/pudding-lab)，保留原 Git 历史和 [此前说明](docs/upstream-readme.md)。本仓库是独立的私有开发项目，不代表上游已合并这些变更；不替上游声明新的授权许可。

技术接口参考：[MediaPipe Hand Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js)、[Web Serial](https://developer.chrome.com/docs/capabilities/serial)。
