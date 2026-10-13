import { element } from '../ui/panel.ts';
export function mountTwinPanel(){
  element('#app').insertAdjacentHTML('beforeend',`
    <nav class="mode-switch" aria-label="交互模式"><button id="mode-twin" aria-pressed="true">实体连接</button><button id="mode-lab" aria-pressed="false">鼠标实验室</button></nav>
    <aside id="twin-controls" class="controls twin-controls" aria-label="实体蛋连接">
      <div class="panel-heading"><h2>手里的蛋，屏幕里的蛋</h2><span id="input-source">模拟输入</span></div>
      <p class="twin-lead">移动跟随手，触碰落在蛋上。</p>
      <section class="connection-section" aria-label="手部追踪">
        <div class="section-label"><span>01 / 双手与动作</span><output id="camera-status" role="status">摄像头未开启</output></div>
        <div class="button-row"><button id="camera-connect">开启摄像头</button><button id="camera-center">当前位置归中</button></div>
        <div id="camera-preview" hidden><video id="hand-video" muted playsinline></video><canvas id="hand-overlay"></canvas><span>绿色：托蛋手 · 桃色：触碰手</span></div>
        <div class="hand-tools"><button id="hand-swap">交换托蛋手</button><button id="gesture-calibrate">校准自然握姿</button><output id="hand-count">0 / 2 只手</output></div>
        <label class="vision-toggle"><input id="vision-enabled" type="checkbox" checked>用手部动作驱动触碰反馈</label>
        <p id="vision-status" class="hint" role="status">先用一只手托蛋，再让另一只手进入画面。</p>
        <details class="gesture-guide"><summary>按压、抚摸怎么做 <span>+</span></summary>
          <p>自然握住蛋后点「校准自然握姿」。托蛋手收紧可捏握；另一只手用食指靠近蛋，再向内按或沿表面缓慢划动。</p>
          <p>绿色托蛋手控制位置，桃色触碰手控制接触；可点击交换。摄像头只估计动作，USB 连接后以传感器为准。</p>
          <label class="slider-label" for="gesture-sensitivity">识别灵敏度 <output id="gesture-sensitivity-value">1.0×</output></label><input id="gesture-sensitivity" type="range" min="60" max="180" value="100">
        </details>
      </section>
      <section class="connection-section" aria-label="压力输入">
        <div class="section-label"><span>02 / 触碰</span><output id="pressure-status" role="status">模拟压力，可直接试玩</output></div>
        <div class="button-row"><button id="serial-connect">连接 USB 串口</button><button id="pressure-release">释放压力</button></div>
        <div class="touch-state"><span id="gesture-label" aria-live="polite">等你碰一碰</span><output id="pressure-peak">0%</output></div>
        <div id="zone-sliders" class="zone-sliders"></div>
        <div id="demo-actions" class="demo-actions"><button data-demo="pinch">捏一下</button><button data-demo="hold">握紧</button><button data-demo="stroke">抚摸</button></div>
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
