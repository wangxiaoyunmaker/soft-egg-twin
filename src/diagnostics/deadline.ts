/** Timeout without abandoning cleanup of a late camera stream or WASM model. */
export function withDeadline<T>(pending:Promise<T>,ms:number,label:string,onLate?:(value:T)=>void):Promise<T>{
  let expired=false;
  return new Promise<T>((resolve,reject)=>{
    const timer=setTimeout(()=>{expired=true;reject(new Error(`${label}超过 ${Math.round(ms/1000)} 秒未完成，请检查权限或重试`));},ms);
    pending.then(value=>{clearTimeout(timer);if(expired)onLate?.(value);else resolve(value);},error=>{clearTimeout(timer);if(!expired)reject(error);});
  });
}
