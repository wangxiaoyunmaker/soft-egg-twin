export interface DiagnosticRecord {time:string;session:string;type:string;data:unknown}
/** A fixed-size history. Never retain frames, pixel arrays or hand landmarks. */
export class DiagnosticBuffer {
  records:DiagnosticRecord[]=[];
  readonly limit:number;
  constructor(limit=240){this.limit=Math.max(1,Math.floor(limit));}
  add(record:DiagnosticRecord){this.records.push(record);if(this.records.length>this.limit)this.records.splice(0,this.records.length-this.limit);}
  restore(value:unknown){
    if(!Array.isArray(value))return;
    this.records=value.filter((r):r is DiagnosticRecord=>!!r&&typeof r==='object'&&typeof r.time==='string'&&typeof r.session==='string'&&typeof r.type==='string').slice(-this.limit);
  }
}
