import { LineDecoder } from './pressure.ts';
interface SerialPort {
  readable:ReadableStream<Uint8Array>|null;
  open(options:{baudRate:number}):Promise<void>;
  close():Promise<void>;
}
interface SerialAPI { requestPort():Promise<SerialPort> }
export class SerialInput {
  private port:SerialPort|null=null;
  private reader:ReadableStreamDefaultReader<Uint8Array>|null=null;
  private reading:Promise<void>|null=null;
  private generation=0;
  connected=false;
  private api?:SerialAPI;
  constructor(api?:SerialAPI){this.api=api;}
  static supported(){return 'serial' in navigator;}
  async connect(baudRate:number,onLine:(line:string)=>void,onEnd:(message:string)=>void){
    const api=this.api??(navigator as Navigator & {serial?:SerialAPI}).serial;
    if(!api)throw new Error('此浏览器没有 Web Serial，请用桌面 Chrome 或 Edge');
    const generation=++this.generation;
    const port=await api.requestPort();
    if(generation!==this.generation)return;
    await port.open({baudRate});
    if(generation!==this.generation){await port.close();return;}
    if(!port.readable){await port.close();throw new Error('串口没有可读数据流');}
    this.port=port;this.connected=true;
    const reader=port.readable.getReader();this.reader=reader;
    this.reading=(async()=>{
      const decoder=new TextDecoder(),lines=new LineDecoder();let message='串口已断开';
      try {
        while(generation===this.generation){
          const {done,value}=await reader.read();if(done)break;
          for(const line of lines.push(decoder.decode(value,{stream:true})))onLine(line);
        }
      }catch(error){message=`串口中断：${error instanceof Error?error.message:String(error)}`;}
      finally {
        reader.releaseLock();
        try{await port.close();}catch{/* Physically unplugged ports may already be closed. */}
        if(this.port===port){this.port=null;this.reader=null;this.connected=false;}
        if(generation===this.generation)onEnd(message);
      }
    })();
  }
  async disconnect(){
    ++this.generation;
    try{await this.reader?.cancel();}catch{/* Already disconnected. */}
    await this.reading;this.reading=null;this.connected=false;
  }
}
