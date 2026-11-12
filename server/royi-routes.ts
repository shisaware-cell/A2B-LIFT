import crypto from 'node:crypto';
import type { Express } from 'express';
import { z } from 'zod';
import { requireAuth,requireRole,type AuthedRequest } from './auth-middleware';
import {getRoyiConfig,createRoyiProvider,parseRoyiQuote,RoyiUnavailable,type RoyiConfig,type RoyiProvider} from './royi-provider';
import type {RoyiStore,RoyiOrder} from './royi-store';
const uid=z.string().uuid();
const quoteInput=z.object({crypto:z.string().regex(/^[A-Z0-9]{2,12}$/),network:z.string().min(2).max(24),zar_amount:z.coerce.number().positive().max(1000000).multipleOf(.01)});
const orderInput=z.object({quoteId:uid,recipientPhone:z.string().trim().regex(/^(?:\+?27|0)[6-8]\d{8}$/),consent:z.literal(true)});
const settlementInput=z.object({amountZar:z.number().positive().max(1000000).multipleOf(.01),reference:z.string().trim().min(3).max(120),method:z.enum(['BANK_EFT','USDT_TRC20','OTHER']),paidAt:z.string().datetime({offset:true}),notes:z.string().trim().max(1000).default('')}).refine(v=>Date.parse(v.paidAt)<=Date.now()+60000,'Settlement date cannot be in the future');
function customerOrder(o:RoyiOrder){const {userId,providerId,commissionZar,...safe}=o;return safe;}
function csvCell(value:unknown){let s=String(value??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
export function registerRoyiRoutes(app:Express,store:RoyiStore,config:()=>RoyiConfig=getRoyiConfig,provider:RoyiProvider=createRoyiProvider(config)){
 const fail=(res:any,e:any)=>res.status(e instanceof RoyiUnavailable?503:500).json({message:e instanceof RoyiUnavailable?e.message:'Unable to complete this request. Please retry later.'});
 const recent=new Map<string,{start:number;count:number}>();
 function limited(id:string){const now=Date.now();if(recent.size>10000)for(const [k,v]of recent)if(v.start<now-60000)recent.delete(k);const row=recent.get(id);if(!row||row.start<now-60000){recent.set(id,{start:now,count:1});return false;}return ++row.count>20;}
 async function reconcile(o:RoyiOrder){if(!o.providerId||o.status==='reversed')return o;const r=await provider.status(o.providerId);if(r?.ok!==true)throw new RoyiUnavailable('Provider order status is not available yet.');
  if(r.siteSource&&r.siteSource!=='A2B_LIFT')throw new RoyiUnavailable('Order attribution could not be verified');
  let status=({PENDING_DEPOSIT:'awaiting_deposit',AWAITING_DEPOSIT:'awaiting_deposit',PROCESSING:'processing',DEPOSIT_DETECTED:'processing',CONFIRMING:'processing',COMPLETED:'completed',EXPIRED:'expired',FAILED:'failed',REVERSED:'reversed',REFUNDED:'reversed'} as Record<string,string>)[r.status];
  if(!status)throw new RoyiUnavailable('Provider returned an unknown order state.');
  if(status==='completed'&&(!Number.isFinite(r.payoutZar)||Math.abs(r.payoutZar-o.targetZar)>.01||typeof r.celbuxTxId!=='string'||!r.celbuxTxId||typeof r.cryptoTxId!=='string'||!r.cryptoTxId||!Number.isFinite(Date.parse(r.payoutAt))))throw new RoyiUnavailable('Voucher completion has not been verified.');
  await store.reconcile(o.id,status);return (await store.get(o.id))!;
 }
 app.get('/api/otc/config',(_req,res)=>{const c=config();res.json({ready:c.ready,message:c.message,assets:c.assets,limits:c.limits,partner:'A2B_LIFT'});});
 app.get('/api/otc/quote',requireAuth,async(req:AuthedRequest,res)=>{
  const input=quoteInput.safeParse(req.query);if(!input.success)return res.status(400).json({message:'Select a supported crypto, network and valid voucher amount.'});const c=config(),v=input.data;if(!c.ready)return res.status(503).json({message:c.message});
  if(!c.assets.some(a=>a.crypto===v.crypto&&a.networks.includes(v.network))||v.zar_amount<c.limits.minZar||v.zar_amount>c.limits.maxZar)return res.status(400).json({message:'This asset, network or voucher value is not supported.'});if(limited(req.auth!.sub))return res.status(429).json({message:'Too many requests. Please wait a minute.'});
  try{const q={...parseRoyiQuote(await provider.quote(v.crypto,v.network,v.zar_amount),v.crypto,v.network,v.zar_amount),id:crypto.randomUUID(),createdAt:new Date().toISOString()};await store.saveQuote(req.auth!.sub,q);return res.json({quote:q});}catch(e){return fail(res,e);}
 });
 app.post('/api/otc/orders',requireAuth,async(req:AuthedRequest,res)=>{
  const input=orderInput.safeParse(req.body);if(!input.success)return res.status(400).json({message:'A valid quote, South African mobile and recipient consent are required.'});const c=config();if(!c.ready)return res.status(503).json({message:c.message});if(limited(req.auth!.sub))return res.status(429).json({message:'Too many requests. Please wait a minute.'});
  let reserved:RoyiOrder|undefined;
  try{const q=await store.quote(input.data.quoteId,req.auth!.sub);if(!q)return res.status(404).json({message:'Quote not found'});if(Date.parse(q.validUntil)<=Date.now())return res.status(409).json({message:'Your quote has expired. Get a new quote.'});
   const phone=input.data.recipientPhone.replace(/^\+/,'').replace(/^0/,'27'),result=await store.reserve(req.auth!.sub,q,phone);reserved=result.order;if(!result.created){if(result.order.recipientPhone!==phone)return res.status(409).json({message:'This quote already belongs to another recipient. Get a new quote.'});return res.json({order:customerOrder(result.order)});}
   // No automatic retries: an upstream timeout may have created an order already.
   const r=await provider.create(q,phone,reserved.id),expires=Number(r?.expiresInMinutes),exact=Number(r?.exactAmount),address=r?.depositAddress;
   if(r?.ok!==true||!['string','number'].includes(typeof r.orderId)||!String(r.orderId)||String(r.orderId).length>100||typeof address!=='string'||!/^[A-Za-z0-9:_-]{20,150}$/.test(address)||r.crypto!==q.crypto||r.network!==q.network||!Number.isFinite(exact)||exact<q.cryptoRequired||exact>q.cryptoRequired*1.01||!Number.isFinite(expires)||expires<1||expires>60)throw new RoyiUnavailable('Deposit instructions could not be verified. This order requires review; do not send funds.');
   await store.activate(reserved.id,String(r.orderId),{depositAddress:address,exactAmount:exact,expiresAt:new Date(Date.now()+expires*60000).toISOString()});return res.status(201).json({order:customerOrder((await store.get(reserved.id))!)});
  }catch(e){if(reserved)await store.markReview(reserved.id).catch(()=>{});return fail(res,e);}
 });
 app.get('/api/otc/orders/me',requireAuth,async(req:AuthedRequest,res)=>{try{return res.json((await store.list(req.auth!.sub)).map(customerOrder));}catch(e){return fail(res,e);}});
 app.get('/api/otc/orders/:id',requireAuth,async(req:AuthedRequest,res)=>{if(!uid.safeParse(req.params.id).success)return res.status(400).json({message:'Invalid order reference'});try{const o=await store.get(String(req.params.id));if(!o||o.userId!==req.auth!.sub)return res.status(404).json({message:'Order not found'});if(!config().ready)return res.json({order:customerOrder(o),message:config().message});if(limited(req.auth!.sub))return res.status(429).json({message:'Please wait before refreshing again.'});return res.json({order:customerOrder(await reconcile(o))});}catch(e){return fail(res,e);}});
 app.post('/api/otc/webhook',async(req:AuthedRequest,res)=>{
  const c=config();if(!c.ready)return res.status(503).json({message:'Provider connection unavailable'});const timestamp=req.header('X-ROYI-Timestamp')||'',signature=(req.header('X-ROYI-Signature')||'').replace(/^sha256=/,''),raw=(req as any).rawBody;
  if(!/^\d{10}$/.test(timestamp)||Math.abs(Date.now()-Number(timestamp)*1000)>300000||!Buffer.isBuffer(raw)||raw.length>65536||! /^[a-f0-9]{64}$/i.test(signature))return res.status(401).json({message:'Invalid webhook authentication'});
  const expected=crypto.createHmac('sha256',c.webhookSecret).update(timestamp+'.').update(raw).digest();if(!crypto.timingSafeEqual(expected,Buffer.from(signature,'hex')))return res.status(401).json({message:'Invalid webhook authentication'});
  const b=req.body;if(b?.site_source!=='A2B_LIFT'||!['otc.order.completed','otc.order.updated','otc.order.reversed'].includes(b.event)||!['string','number'].includes(typeof b.order_id))return res.status(400).json({message:'Invalid webhook event'});
  try{const o=await store.byProvider(String(b.order_id));if(!o)return res.status(404).json({message:'Order not found'});const key=crypto.createHash('sha256').update(raw).digest('hex');await reconcile(o);await store.webhookReceipt(key);return res.json({received:true});}catch(e){return fail(res,e);}
 });
 const admin=requireRole(['admin']);
 app.get('/api/admin/otc/config',requireAuth,admin,(_req,res)=>{const c=config();return res.json({ready:c.ready,message:c.message,checks:[{label:'Provider explicitly enabled',configured:process.env.ROYI_ENABLED==='true'},{label:'Approved production API URL',configured:!!c.baseUrl},{label:'Server-side API credential',configured:c.apiKey.length>=16},{label:'Webhook verification secret',configured:c.webhookSecret.length>=32},{label:'Verified asset/network and limits',configured:c.assets.length>0&&c.limits.minZar>0&&c.limits.maxZar>=c.limits.minZar}]});});
 app.get('/api/admin/otc/statement',requireAuth,admin,async(req,res)=>{const month=String(req.query.month||new Date().toLocaleDateString('en-CA',{timeZone:'Africa/Johannesburg'}).slice(0,7));if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return res.status(400).json({message:'Use month YYYY-MM'});try{const statement=await store.statement(month);if(req.query.format==='csv'){const header=['Order','Created','Crypto','Network','Voucher ZAR','Commission ZAR','Status'];const lines=statement.orders.map(o=>[o.id,o.createdAt,o.crypto,o.network,o.targetZar,o.status==='completed'?o.commissionZar:0,o.status].map(csvCell).join(','));return res.type('text/csv').attachment(`A2B-ROYI-${month}.csv`).send([header.join(','),...lines].join('\r\n'));}return res.json(statement);}catch(e){return fail(res,e);}});
 app.post('/api/admin/otc/payouts',requireAuth,admin,async(req:AuthedRequest,res)=>{const p=settlementInput.safeParse(req.body);if(!p.success)return res.status(400).json({message:'Enter a positive settlement, valid past date, payment method and unique reference.'});try{return res.status(201).json(await store.settle(req.auth!.sub,p.data));}catch{return res.status(409).json({message:'Reference already recorded, or amount exceeds verified unpaid commission. No money was moved.'});}});
}
