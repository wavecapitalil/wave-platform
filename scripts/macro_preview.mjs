// Local-only acceptance server. No production data writes; no synthetic consensus.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {catalogue,history,componentHistory} from '../supabase/functions/wave-data/macro.ts';
const root=path.resolve('apps/terminal/public');
const port=Number(process.env.WAVE_MACRO_PREVIEW_PORT||8774);
http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/api/macro-series'){
   const id=u.searchParams.get('series');
   const data=id?(u.searchParams.has('components')?await componentHistory(id):await history(id)):catalogue();
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));return;
  }
  if(u.pathname.startsWith('/api/')){res.writeHead(404,{'Content-Type':'application/json'});res.end('{"error":"Outside isolated local Macro acceptance test"}');return;}
  const file=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/terminal_app.html':u.pathname));
  if(!file.startsWith(root+path.sep))throw Error('Invalid path');
  const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.json':'application/json'}[path.extname(file)]||'application/octet-stream';
  let body=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store'}); if(path.basename(file)==='terminal-market.js')body=Buffer.from(body.toString().replace('http://localhost:5001','http://127.0.0.1:'+port)); res.end(body);
 }catch(e){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:String(e.message)}));}
}).listen(port,'127.0.0.1',()=>console.log('Local Macro preview: http://127.0.0.1:'+port+'/terminal_app.html'));
