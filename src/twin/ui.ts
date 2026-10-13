import { element } from '../ui/panel.ts';
export function mountTwinPanel(){
  element('#app').insertAdjacentHTML('beforeend',`
    <nav class="mode-switch" aria-label="交互模式"><button id="mode-twin" aria-pressed="true">实体连接</button><button id="mode-lab" aria-pressed="false">鼠标实验室</button></nav>
    <aside id="twin-controls" class="controls twin-controls" aria-label="实体蛋连接">
      <div class="panel-heading"><h2>手里的蛋，屏幕里的蛋</h2><span id="input-source">模拟输入</span></div>
      <p class="twin-lead">拍拍头，会惊讶；摸摸头，会享受；双手托着，会安心。</p>
      <section class="connection-section" aria-label="手部追踪">
        <div class="section-label"><span>01 / 拍头 · 摸头 · 双手托举</span><output id="camera-status" role="status">摄像头未开启</output></div>
        <div class="button-row"><button id="camera-connect">开启摄像头</button><button id="camera-center">当前位置归中</button></div>
        <div id="camera-preview" hidden><video id="hand-video" muted playsinline></video><canvas id="hand-overlay" aria-label="追踪预览，点击黄色蛋校准颜色"></canvas><span>绿色：定位手 · 桃色：另一只手 · 金框：蛋 · 蓝圈：头部范围</span></div>
        <label class="vision-toggle"><input id="egg-enabled" type="checkbox" checked>跟随黄色蛋的位置与倾斜</label>
        <p id="egg-status" class="hint" role="status">开启摄像头后，让黄色蛋露出轮廓。</p>
        <details class="gesture-guide"><summary>蛋的追踪与校准 <span>+</span></summary>
          <p>先把蛋竖直拿好，露出尽量完整的黄色轮廓，再点「当前位置归中」。金框锁定后，左右、上下移动和倾斜摇摆会同步到屏幕。蛋在画面里竖直时数字蛋也竖直；归中只调整位置与大小。</p>
          <p>识别不到时，可点击预览里蛋的黄色部分校准颜色，避开高光与手指。背景尽量不要有相似黄色物体。</p>
          <button id="egg-color-reset">恢复默认黄色</button><p id="egg-color-status" role="status"></p>
          <label class="vision-toggle"><input id="egg-scale" type="checkbox" checked>跟随轮廓大小，表现靠近与远离</label>
          <p>倾斜来自画面内的长轴方向；大小只是距离的近似，捏变形、遮挡也会影响。纯色蛋的长轴自转、前后翻转无法可靠测出。丢失轮廓时保持最后姿态。</p>
        </details>
        <div class="hand-tools"><button id="hand-swap">交换定位手</button><button id="gesture-calibrate">重置动作识别</button><output id="hand-count">0 / 2 只手</output></div>
        <label class="vision-toggle"><input id="vision-enabled" type="checkbox" checked>识别拍头、摸头和双手托举</label>
        <div class="button-row"><button id="head-mark">标记蛋头</button><button id="head-auto">恢复自动定位</button></div>
        <p id="support-debug" class="hint" role="status">拥抱：等待双手进入画面</p>
        <p id="interaction-debug" class="hint" role="status">等待动作诊断</p>
        <p id="vision-status" class="hint" role="status">先让黄色蛋露出轮廓，等金框锁定，再进行三种动作。</p>
        <details class="gesture-guide"><summary>三种动作怎么做 <span>+</span></summary>
          <p>拍头：用一只手从上方靠近蛋头，短促拍下，再抬起。摸头：用手指沿蛋的上端缓慢来回轻扫。双手托住：两只手从蛋下方或两侧包住，稳定托抱约四分之一秒。</p>
          <p>可以一只手拿蛋，另一只手做拍头或摸头。两只手仅仅出现在画面里，不会算作托举。双手托抱优先于轻扫表情。请露出黄色轮廓，摄像头只估计动作与接触。遮挡严重时可点「标记蛋头」，再点击预览中蛋的最上端；手动参考随托蛋手估计位置，移动或换手后请重新标记。</p>
          <label class="slider-label" for="gesture-sensitivity">识别灵敏度 <output id="gesture-sensitivity-value">1.0×</output></label><input id="gesture-sensitivity" type="range" min="60" max="180" value="100">
        </details>
      </section>
      <section class="connection-section" aria-label="压力输入">
        <div class="section-label"><span>02 / 表情与触碰</span><output id="pressure-status" role="status">模拟压力，可直接试玩</output></div>
        <div class="button-row"><button id="serial-connect">连接 USB 串口</button><button id="pressure-release">释放压力</button></div>
        <div class="touch-state"><span id="gesture-label" aria-live="polite">等你碰一碰</span><output id="pressure-peak">0%</output></div>
        <div id="zone-sliders" class="zone-sliders"></div>
        <div id="demo-actions" class="demo-actions"><button data-demo="pat">拍头 · 惊讶</button><button data-demo="headStroke">摸头 · 享受</button><button data-demo="cradle">双手托住 · 安心</button></div>
        <p id="pressure-hint" class="hint">滑块模拟各区域压力；也可以点上方动作体验。</p>
      </section>
      <details class="twin-settings"><summary>测点与校准 <span>+</span></summary>
        <p>默认六个区域是示例。导出配置后，可修改数量、位置、名称和原始读数量程，再导入。</p>
        <div class="button-row"><button id="pressure-zero">以当前握持校零</button><button id="config-export">导出配置</button></div>
        <label class="file-label">导入测点 JSON<input id="config-import" type="file" accept=".json,application/json"></label>
        <p>抚摸是根据轻压在相邻测点间移动推测的，需用你们的外壳和传感器验证。</p>
        <p id="config-status" role="status"></p>
      </details>
      <div class="twin-bottom"><button id="twin-reset">复原蛋蛋</button><span>画面在本机处理</span></div>
    </aside>`);
  element('.controls:not(.twin-controls)').id='lab-controls';
  element('#lab-controls').hidden=true;
}
