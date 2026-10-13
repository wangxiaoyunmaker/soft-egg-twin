# 2026-10-13 实物动作失败诊断

输入：用户导出的 `egg-diagnostics-2026-10-13T13-29-41-306Z.json`。原始日志与摄像头画面留在本机，不进入仓库。日志是定期采样而非逐帧动作标注，因此下列次数不能作为动作识别准确率。

## 实际记录

240 条记录中，95 条性能汇总的摄像头已开启。65 条使用视觉输入、30 条使用模拟输入；动作状态 93 条 idle、1 条 headStroke、1 条 cradle，未采样到 pat。81/95 条蛋轮廓年龄超过 400 ms 或没有定位数据。最后十条前台视觉汇总为 3–4 FPS。最后一次汇总：手模型平均 178.5 ms（最高 243.7 ms），整个 twin.update 平均 187 ms；物理计算 28.8 ms，表面更新 6.6 ms，渲染提交 1.8 ms。视频 readyState=4、视频时间持续前进，说明摄像头流已播放。

主线程同步运行手模型是已确认的主要耗时。JS 堆读数与服务内存没有提供足够证据证明内存泄漏；JS 堆也不涵盖 WASM、GPU、视频和浏览器进程全部内存。不能由此保证完全没有内存问题。

## 旧规则为什么漏掉

- 拍头要求相邻两帧从外侧阈值直接进入内侧阈值。正常的多帧逐渐下降可以错过这次跨越，低帧率也使判定不稳定。
- 摸头限制掌心必须在上方，并固定选取一个头部候选手指；握蛋手的静止手指会占用候选。弧线、斜向轻扫容易被拒绝。
- 蛋轮廓只在被指定的定位手附近搜索。若上方动作手被选为定位手，真正位于另一只手中的黄色蛋会被拒绝。
- 轮廓失踪超过 400 ms 即失去动作参考，接触产生的遮挡会中断轨迹。
- 示例按钮会永久取消视觉开关，用户观看表情示例后可能仍处于模拟模式。

## 改动

- MediaPipe 双手推理移入 module Worker；GPU 优先，失败后在 Worker 中尝试 CPU。宽度 384、单帧在途，不累积帧队列，10 秒无结果停止并提示。轮廓检测与关键点使用同一输入帧。
- 在全部可见手附近选蛋，每只手单独保留手指轨迹，避免握蛋手压住动作手的判定。
- 拍头追踪多帧接近与下降，在 600 ms 内的下落达到位置和速度条件时触发；摸头按三帧以上、至少 240 ms 的相对累计行程判断，支持弧线。
- 自动头部参考短暂遮挡时随下方托蛋手平移，最长保留 1.2 秒。手动标记属于明确启用的后备参考，无法确认真实接触；大幅移动、换手后需要重新标记。
- 蓝色头部参考圈及当前拒绝原因显示在预览附近。导出日志包含规则版本、采样间隔、每只手的相对候选位置、轨迹行程/跨度、托举配对、原因累计次数、参考来源、视觉开关与示例状态；不记录图像或原始关键点。
- 示例仅临时预览，结束后恢复原来的视觉开关状态。

## 库的选择

现有 MediaPipe 已经提供双手的 21 个关键点。官方 Gesture Recognizer 内置类别为张手、握拳、指向、拇指上下、Victory、ILoveYou 等，不含与实体蛋相关的拍头/摸头。Fingerpose 用手指弯曲与方向描述静态手势，无法直接替代上述时序判断。

下载并只读查看了 kinivi 的 MediaPipe 动态手势项目（本机参考副本，提交 0e737bb），其点历史窗口和自定义训练可作为后续参考；内置动态类别 Stop、Clockwise、Counter Clockwise、Move，仍不是本项目动作。没有执行该第三方项目，也没有把它当作已训练好的拍头模型。

后台实现参考官方 MediaPipe module Worker 示例，使用 `FilesetResolver.forVisionTasks(wasmPath, true)`；直接套用旧 importScripts 方式会与 module Worker 冲突。

来源：

- [MediaPipe 手模型 Web 文档：同步推理与 Worker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js)
- [官方 module Worker 示例](https://github.com/google-ai-edge/mediapipe-samples-web/blob/main/src/workers/hand-landmarker.worker.ts)
- [MediaPipe Gesture Recognizer 类别与自定义模型](https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer)
- [Fingerpose](https://github.com/andypotato/fingerpose)
- [点历史动态手势参考](https://github.com/kinivi/hand-gesture-recognition-mediapipe)

## 验证边界

新增合成回归覆盖逐渐拍下、握蛋手不阻塞动作手、掌心侧下方的弧线轻扫、双手范围搜蛋、短暂遮挡及手动参考，以及恢复托举。合成浏览器回放检验动作到三种表情的完整连接。

真实 MediaPipe Worker 空白帧验证：GPU 启动成功，5 帧均返回，首帧 1609 ms（初始化暖机），其后 47/41/57/36 ms；主线程计时器继续运行。空白帧没有手，不代表实物手势速度、准确率或遮挡表现。真实用户的新版本拍头/摸头仍需同场景复测和新日志，不能以回归通过宣称准确识别。
