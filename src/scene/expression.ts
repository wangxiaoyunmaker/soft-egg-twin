import type { EggInteraction } from '../twin/egg-interactions.ts';
export type ExpressionName='happy'|'squished'|'surprised'|'relieved'|'soothed'|'cherished';
export interface FaceInput { held:boolean; pressing:boolean; displacement:number; lift:number; serving:boolean; pressure?:number; stroke?:boolean;interaction?:EggInteraction }

/** A quick reaction to contact, followed by a brief smile on release. */
export class Expression {
  name:ExpressionName='happy';
  squeeze=0;
  surprise=0;
  relief=0;
  blink=0;
  comfort=0;
  warmth=0;
  private time=0;
  private released=0;
  private touched=false;
  reset(){this.name='happy';this.warmth=this.comfort=this.squeeze=this.surprise=this.relief=this.blink=this.time=this.released=0;this.touched=false;}
  update(dt:number,input:FaceInput) {
    this.time+=dt;
    const touched=input.held||input.pressing||(input.pressure??0)>.38;
    if(this.touched&&!touched)this.released=.85;
    this.touched=touched;this.released=Math.max(0,this.released-dt);
    const stretched=input.held&&input.lift>.06;
    const pat=input.interaction==='head-pat',stroke=input.stroke||input.interaction==='head-stroke',cradle=input.interaction==='cradle';
    this.name=pat?'surprised':stroke?'soothed':cradle?'cherished':touched?(stretched?'surprised':'squished'):input.serving?'surprised':this.released>0?'relieved':'happy';
    const intensity=pat?1:Math.min(1,input.pressure&&input.pressure>.38?input.pressure:.5+input.displacement*2.5);
    const k=1-Math.exp(-dt*(touched?18:9));
    this.squeeze+=((this.name==='squished'?intensity:0)-this.squeeze)*k;
    this.surprise+=((this.name==='surprised'?intensity:0)-this.surprise)*k;
    this.comfort+=((stroke?1:0)-this.comfort)*k;
    this.warmth+=((cradle?1:0)-this.warmth)*k;
    this.relief+=((this.name==='relieved'?1:0)-this.relief)*k;
    // A short, occasional blink. Interaction reactions take precedence.
    const phase=(this.time+.8)%4.7;
    this.blink=touched?0:Math.max(0,1-Math.abs(phase-.12)/.12);
  }
}
