import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import {getRoyiConfig,parseRoyiQuote,type RoyiProvider,type RoyiQuote} from './royi-provider';
import {registerRoyiRoutes} from './royi-routes';
import {signAccessToken} from './auth';
import type {RoyiStore,RoyiOrder} from './royi-store';
const config=()=>({ready:true,message:'Test fixture',assets:[{crypto:'USDT',networks:['TRC-20']}],limits:{minZar:50,maxZar:5000},baseUrl:'https://usdt2celbux.com',apiKey:'test-only-not-a-real-key',webhookSecret:'test-only-webhook-secret-32-chars-long'});
const quoteResponse=()=>({status:'success',quote:{crypto:'USDT',spot_rate_zar:20,target_voucher_zar:200,crypto_required:11,net_voucher_delivered_zar:200,valid_until:new Date(Date.now()+300000).toISOString(),fee_breakdown:{total_fee_zar:20,total_service_fee_pct:10,a2b_reseller_commission_zar:3}}});
test('configuration and provider quote arithmetic fail closed',()=>{
 assert.equal(getRoyiConfig({} as any).ready,false);
 const unsafe={ROYI_ENABLED:'true',ROYI_API_BASE_URL:'https://evil.example',ROYI_API_KEY:'x'.repeat(20),ROYI_WEBHOOK_SECRET:'x'.repeat(40),ROYI_ASSETS_JSON:'[{"crypto":"USDT","networks":["TRC-20"]}]',ROYI_MIN_ZAR:'50',ROYI_MAX_ZAR:'5000'};
 assert.equal(getRoyiConfig(unsafe).ready,false);assert.equal(getRoyiConfig({...unsafe,ROYI_API_BASE_URL:'https://usdt2celbux.com'}).ready,true);
 assert.equal(parseRoyiQuote(quoteResponse(),'USDT','TRC-20',200).cryptoRequired,11);
 const demo=quoteResponse();demo.quote.crypto_required=10;assert.throws(()=>parseRoyiQuote(demo,'USDT','TRC-20',200));
 const invalid=quoteResponse();(invalid.quote as any).net_voucher_delivered_zar=undefined;assert.throws(()=>parseRoyiQuote(invalid,'USDT','TRC-20',200));
});
test('HTTP order ownership, immutable quote, idempotency, signed webhook and provider-only completion',async()=>{
 process.env.JWT_SECRET='royi-unit-test-only';let creates=0,completion=false;const qs=new Map<string,RoyiQuote>(),orders=new Map<string,RoyiOrder>();const receipts=new Set<string>();
 const store={async saveQuote(userId:string,q:RoyiQuote){qs.set(userId+q.id,q);},async quote(id:string,u:string){return qs.get(u+id);},async reserve(u:string,q:RoyiQuote,phone:string){let old=[...orders.values()].find(o=>o.quoteId===q.id);if(old)return {order:old,created:false};const o:any={...q,id:crypto.randomUUID(),quoteId:q.id,userId:u,status:'creating',recipientPhone:phone,providerId:null,depositAddress:null,exactAmount:null,expiresAt:null};orders.set(o.id,o);return{order:o,created:true};},async get(id:string){return orders.get(id);},async list(u:string){return[...orders.values()].filter(o=>o.userId===u);},async byProvider(id:string){return[...orders.values()].find(o=>o.providerId===id);},async activate(id:string,providerId:string,patch:any){Object.assign(orders.get(id)!,patch,{providerId,status:'awaiting_deposit'});},async markReview(id:string){orders.get(id)!.status='review_required';},async reconcile(id:string,status:string){orders.get(id)!.status=status;},async webhookReceipt(id:string){const fresh=!receipts.has(id);receipts.add(id);return fresh;},async statement(){return{period:'2026-11',summary:{},orders:[],payouts:[]};}} as unknown as RoyiStore;
 const provider:RoyiProvider={async quote(){return quoteResponse();},async create(q,phone,ref){creates++;return {ok:true,orderId:123,depositAddress:'T'+'a'.repeat(33),exactAmount:q.cryptoRequired,crypto:q.crypto,network:q.network,expiresInMinutes:15};},async status(){return completion?{ok:true,status:'COMPLETED',payoutZar:200,cryptoTxId:'test-tx',celbuxTxId:'test-voucher-reference',payoutAt:new Date().toISOString()}:{ok:true,status:'PROCESSING'};}};
 const app=express();app.use(express.json({verify:(req,_res,buf)=>{(req as any).rawBody=buf;}}));registerRoyiRoutes(app,store,config,provider);const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.on('listening',r));const port=(server.address() as any).port,tokens=Object.fromEntries(['alice','bob','admin'].map(u=>[u,signAccessToken({sub:u,role:u==='admin'?'admin':'client'})]));
 async function call(path:string,user='alice',method='GET',body?:any,headers={}){const r=await fetch(`http://127.0.0.1:${port}${path}`,{method,headers:{'Content-Type':'application/json',...(user?{Authorization:'Bearer '+tokens[user]}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});return{code:r.status,data:await r.json()};}
 try{
 assert.equal((await call('/api/otc/quote?crypto=USDT&network=TRC-20&zar_amount=200','')).code,401);assert.equal((await call('/api/admin/otc/statement','alice')).code,403);
 const q=(await call('/api/otc/quote?crypto=USDT&network=TRC-20&zar_amount=200')).data.quote;
 assert.equal((await call('/api/otc/orders','bob','POST',{quoteId:q.id,recipientPhone:'+27821234567',consent:true})).code,404);
 const body={quoteId:q.id,recipientPhone:'+27821234567',consent:true,cryptoAmount:1,status:'completed'},created=await call('/api/otc/orders','alice','POST',body);assert.equal(created.code,201);assert.equal(created.data.order.cryptoRequired,11);assert.equal(created.data.order.status,'awaiting_deposit');assert(!('commissionZar'in created.data.order));const id=created.data.order.id;
 assert.equal((await call('/api/otc/orders','alice','POST',body)).code,200);assert.equal(creates,1);assert.equal((await call('/api/otc/orders/'+id,'bob')).code,404);
 const callback={event:'otc.order.completed',order_id:123,site_source:'A2B_LIFT',voucher_zar:999999};assert.equal((await call('/api/otc/webhook','','POST',callback)).code,401);
 const timestamp=String(Math.floor(Date.now()/1000)),signature=crypto.createHmac('sha256',config().webhookSecret).update(timestamp+'.'+JSON.stringify(callback)).digest('hex');const headers={'X-ROYI-Timestamp':timestamp,'X-ROYI-Signature':signature};
 assert.equal((await call('/api/otc/webhook','','POST',callback,headers)).code,200);assert.equal(orders.get(id)!.status,'processing');
 completion=true;assert.equal((await call('/api/otc/orders/'+id)).data.order.status,'completed');assert.equal((await call('/api/otc/orders/me','bob')).data.length,0);
 const stale={'X-ROYI-Timestamp':'1234567890','X-ROYI-Signature':signature};assert.equal((await call('/api/otc/webhook','','POST',callback,stale)).code,401);
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
