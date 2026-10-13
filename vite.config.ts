import { defineConfig } from 'vite';
export default defineConfig({
  server:{host:'127.0.0.1',port:5174,strictPort:true},
  plugins:[{
    name:'local-diagnostic-health',
    configureServer(server){
      server.middlewares.use('/__diagnostics/health',(_request,response)=>{
        const m=process.memoryUsage();response.setHeader('Content-Type','application/json');response.setHeader('Cache-Control','no-store');
        response.end(JSON.stringify({service:'soft-egg-twin',pid:process.pid,uptimeSeconds:Math.round(process.uptime()),rssMB:Math.round(m.rss/1048576),heapMB:Math.round(m.heapUsed/1048576)}));
      });
    },
  }],
});
