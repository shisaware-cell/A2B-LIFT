import { z } from 'zod';
export class RoyiUnavailable extends Error {}
export type RoyiConfig={ready:boolean;message:string;assets:{crypto:string;networks:string[]}[];limits:{minZar:number;maxZar:number};baseUrl:string;apiKey:string;webhookSecret:string};
const assetsSchema=z.array(z.object({crypto:z.string().regex(/^[A-Z0-9]{2,12}$/),networks:z.array(z.string().regex(/^[A-Za-z0-9 -]{2,24}$/)).min(1).max(10)})).min(1).max(60);
export function getRoyiConfig(env:Record<string,string|undefined>=process.env):RoyiConfig {
 let assets:RoyiConfig['assets']=[];try{assets=assetsSchema.parse(JSON.parse(env.ROYI_ASSETS_JSON||'[]'));}catch{}
 let baseUrl='';try{const u=new URL(env.ROYI_API_BASE_URL||'');if(u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&['usdt2celbux.com','royi.onefinger.org'].includes(u.hostname))baseUrl=u.origin;}catch{}
 const minZar=Number(env.ROYI_MIN_ZAR),maxZar=Number(env.ROYI_MAX_ZAR),apiKey=env.ROYI_API_KEY||'',webhookSecret=env.ROYI_WEBHOOK_SECRET||'';
 const ready=env.ROYI_ENABLED==='true'&&!!baseUrl&&apiKey.length>=16&&webhookSecret.length>=32&&assets.length>0&&minZar>0&&maxZar>=minZar;
 return {ready,message:ready?'Provider connected; quotes and orders depend on current provider availability.':'Crypto voucher purchases are not available yet. Provider onboarding and secure connection are pending.',assets,limits:{minZar:Number.isFinite(minZar)&&minZar>0?minZar:0,maxZar:Number.isFinite(maxZar)&&maxZar>0?maxZar:0},baseUrl,apiKey,webhookSecret};
}
export type RoyiQuote={id:string;crypto:string;network:string;targetZar:number;rateZar:number;cryptoRequired:number;totalFeeZar:number;serviceFeePercent:number;commissionZar:number;validUntil:string;createdAt:string};
const positive=(value:unknown)=> typeof value==='number'&&Number.isFinite(value)&&value>0;
export function parseRoyiQuote(body:any,crypto:string,network:string,targetZar:number):Omit<RoyiQuote,'id'|'createdAt'> {
 const q=body?.quote,f=q?.fee_breakdown,deadline=Date.parse(q?.valid_until);
 if(body?.status!=='success'||q?.crypto!==crypto||!positive(q?.spot_rate_zar)||!positive(q?.crypto_required)||!positive(q?.target_voucher_zar)||Math.abs(q.target_voucher_zar-targetZar)>.01||Math.abs(q?.net_voucher_delivered_zar-targetZar)>.01||!Number.isFinite(q?.net_voucher_delivered_zar)||!Number.isFinite(f?.total_fee_zar)||f.total_fee_zar<0||!Number.isFinite(f?.total_service_fee_pct)||f.total_service_fee_pct<0||!Number.isFinite(f?.a2b_reseller_commission_zar)||f.a2b_reseller_commission_zar<0||f.a2b_reseller_commission_zar>f.total_fee_zar||!Number.isFinite(deadline)||deadline<=Date.now()+30000||deadline>Date.now()+3600000)throw new RoyiUnavailable('Provider quote is incomplete or expired. Please try again later.');
 const total=targetZar+f.total_fee_zar,gross=q.crypto_required*q.spot_rate_zar;
 // A full-value voucher and a separate fee must both be funded. The ZIP's demo omits this fee.
 if(Math.abs(gross-total)>Math.max(.05,total*.001)||Math.abs(f.total_fee_zar-targetZar*f.total_service_fee_pct/100)>.05)throw new RoyiUnavailable('Provider fee totals could not be verified. Checkout is unavailable.');
 return {crypto,network,targetZar,rateZar:q.spot_rate_zar,cryptoRequired:q.crypto_required,totalFeeZar:f.total_fee_zar,serviceFeePercent:f.total_service_fee_pct,commissionZar:f.a2b_reseller_commission_zar,validUntil:new Date(deadline).toISOString()};
}
export interface RoyiProvider {quote(crypto:string,network:string,amount:number):Promise<any>;create(quote:RoyiQuote,phone:string,ref:string):Promise<any>;status(id:string):Promise<any>}
export function createRoyiProvider(config:()=>RoyiConfig=getRoyiConfig):RoyiProvider {
 async function request(path:string,method='GET',body?:unknown){const c=config();if(!c.ready)throw new RoyiUnavailable(c.message);let res:Response;try{res=await fetch(c.baseUrl+path,{method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${c.apiKey}`,'X-Partner-Key':c.apiKey,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});}catch{throw new RoyiUnavailable('ROYI is not responding. Please retry later.');}if(!res.ok)throw new RoyiUnavailable('ROYI is temporarily unavailable. No deposit instructions are available.');const text=await res.text();if(text.length>262144)throw new RoyiUnavailable('Invalid provider response');try{return JSON.parse(text);}catch{throw new RoyiUnavailable('Invalid provider response');}}
 return {quote:(crypto,network,amount)=>request(`/api/otc/quote?crypto=${encodeURIComponent(crypto)}&network=${encodeURIComponent(network)}&zar_amount=${amount}`),create:(q,phone,ref)=>request('/api/orders','POST',{siteSource:'A2B_LIFT',payoutMethod:'CELBUX_VOUCHER',depositCrypto:q.crypto,depositNetwork:q.network,cryptoAmount:q.cryptoRequired,lockedRate:q.rateZar,phone,customerRef:ref}),status:id=>request('/api/orders/status/'+encodeURIComponent(id))};
}
