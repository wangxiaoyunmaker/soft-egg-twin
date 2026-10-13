export interface Zone {
  id:string;
  label:string;
  /** Egg-local position: x/z in [-1,1], y in [0,1]. Snapped to the closest skin vertex. */
  position:[number,number,number];
  baseline:number;
  maximum:number;
}
export interface TwinConfig { zones:Zone[]; staleMs:number; baudRate:number }
export const defaultConfig:TwinConfig={
  staleMs:750,baudRate:115200,
  zones:[
    {id:'top',label:'顶部',position:[0,.98,0],baseline:0,maximum:4095},
    {id:'left',label:'左侧',position:[-.75,.55,.4],baseline:0,maximum:4095},
    {id:'front',label:'正面',position:[.1,.48,.9],baseline:0,maximum:4095},
    {id:'right',label:'右侧',position:[.8,.55,.35],baseline:0,maximum:4095},
    {id:'back',label:'背面',position:[0,.5,-.9],baseline:0,maximum:4095},
    {id:'base',label:'底部',position:[0,.06,.2],baseline:0,maximum:4095},
  ],
};
export function parseConfig(value:unknown):TwinConfig {
  if(!value||typeof value!=='object')throw new Error('配置必须是 JSON 对象');
  const c=value as TwinConfig;
  if(!Array.isArray(c.zones)||c.zones.length<1||c.zones.length>32)throw new Error('需要 1–32 个压力区域');
  const ids=new Set<string>();
  for(const z of c.zones){
    if(!z||typeof z.id!=='string'||!/^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/.test(z.id)||ids.has(z.id))throw new Error('区域 id 必须唯一，使用字母、数字、横线或下划线');
    if(typeof z.label!=='string'||!z.label.trim()||z.label.length>30)throw new Error('区域名称需要 1–30 个字符');
    if(!Array.isArray(z.position)||z.position.length!==3||!z.position.every(Number.isFinite)||Math.abs(z.position[0])>1||z.position[1]<0||z.position[1]>1||Math.abs(z.position[2])>1)throw new Error('position 范围：x/z 为 -1～1，y 为 0～1');
    if(!Number.isFinite(z.baseline)||!Number.isFinite(z.maximum)||z.maximum<=z.baseline)throw new Error('maximum 必须大于 baseline；输入应随受力增大');
    ids.add(z.id);
  }
  if(!Number.isInteger(c.baudRate)||c.baudRate<1200||c.baudRate>2000000)throw new Error('baudRate 无效');
  if(!Number.isFinite(c.staleMs)||c.staleMs<100||c.staleMs>5000)throw new Error('staleMs 需要在 100–5000 毫秒之间');
  return structuredClone(c);
}
