import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import express from 'express';
import { signAccessToken } from './auth';
import { registerMatricDanceRoutes } from './matric-dance-routes';
import { matricDanceRequestSchema, southAfricaTime } from '../shared/matric-dance';
import type { MatricBooking, MatricStore } from './matric-dance-store';
const future=new Date(Date.now()+10*86400000).toISOString().slice(0,10);
const details={contactName:'Parent Example',contactPhone:'+27821234567',school:'Example Secondary',eventDate:future,pickupTime:'16:30',pickupAddress:'10 Test Road, Sandton',venueAddress:'Example venue, Sandton',vehicleType:'luxury_van',passengers:6,serviceHours:3,photoMinutes:30,returnRequested:false,adultContactConfirmed:true};
test('premium category, passenger, SAST, contact and itinerary validation',()=>{
 assert(matricDanceRequestSchema.safeParse(details).success);
 assert.equal(new Date(southAfricaTime(future,'16:30')).getUTCHours(),14);
 for(const patch of [{vehicleType:'budget'},{vehicleType:'van'},{vehicleType:'business',passengers:5},{passengers:0},{adultContactConfirmed:false},{contactPhone:'---------'} ,{eventDate:'2027-02-30'},{pickupTime:'24:00'},{eventDate:'2020-01-01'},{returnRequested:true,returnTime:'15:00'},{returnRequested:true,returnTime:'23:59',returnDate:'2020-01-01'}]) assert(!matricDanceRequestSchema.safeParse({...details,...patch}).success,JSON.stringify(patch));
 const next=new Date(Date.parse(future+'T00:00:00Z')+86400000).toISOString().slice(0,10);
 assert(matricDanceRequestSchema.safeParse({...details,returnRequested:true,returnDate:next,returnTime:'00:30'}).success);
});
test('real authenticated HTTP workflow isolates customers and requires quote acceptance before confirmation',async()=>{
 process.env.JWT_SECRET='matric-test-only-not-a-production-secret';const rows=new Map<string,MatricBooking>();
 const store:MatricStore={async list(userId){return [...rows.values()].filter(r=>!userId||r.userId===userId);},async create(userId,d){const r={id:crypto.randomUUID(),userId,details:d,status:'requested' as const,adminNote:'',quoteAmount:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),revision:0};rows.set(r.id,r);return r;},async get(id){return rows.get(id);},async update(id,expected,p,revision){const r=rows.get(id);if(!r||r.status!==expected||r.revision!==revision)return;const next={...r,...p,revision:r.revision+1};rows.set(id,next);return next;}};
 const app=express();app.use(express.json());registerMatricDanceRoutes(app,store);const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.on('listening',r));const port=(server.address() as any).port;
 const tokens=Object.fromEntries(['alice','bob','admin'].map(id=>[id,signAccessToken({sub:id,role:id==='admin'?'admin':'client'})]));
 async function call(path:string,as='alice',method='GET',body?:unknown){const res=await fetch(`http://127.0.0.1:${port}${path}`,{method,headers:{'Content-Type':'application/json',...(as?{Authorization:'Bearer '+tokens[as]}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {code:res.status,data:await res.json()};}
 try{
  assert.equal((await call('/api/matric-dance/bookings/me','')).code,401);
  assert.equal((await call('/api/admin/matric-dance/bookings','alice')).code,403);
  assert.equal((await call('/api/matric-dance/bookings','alice','POST',{...details,vehicleType:'budget'})).code,400);
  const created=await call('/api/matric-dance/bookings','alice','POST',{...details,userId:'bob',status:'confirmed',quoteAmount:1});assert.equal(created.code,201);assert.equal(created.data.userId,'alice');assert.equal(created.data.status,'requested');assert.equal(created.data.quoteAmount,null);
  const id=created.data.id,admin='/api/admin/matric-dance/bookings/'+id,client='/api/matric-dance/bookings/'+id;
  assert.equal((await call('/api/matric-dance/bookings/me','bob')).data.length,0);assert.equal((await call(client+'/cancel','bob','POST',{})).code,404);
  assert.equal((await call(admin,'admin','PATCH',{status:'confirmed'})).code,409);
  assert.equal((await call(admin,'admin','PATCH',{status:'quoted',quoteAmount:3500})).code,400);
  assert.equal((await call(admin,'admin','PATCH',{status:'quoted',quoteAmount:3500,adminNote:'Confirmed available V-Class. Pickup and return included; agreed payment and cancellation terms.'})).code,200);
  assert.equal((await call(client+'/accept','alice','POST',{expectedRevision:0})).code,409);
  assert.equal((await call(client+'/accept','alice','POST',{expectedRevision:1})).data.status,'accepted');
  assert.equal((await call(admin,'admin','PATCH',{status:'confirmed',quoteAmount:4500})).code,400);
  assert.equal((await call(admin,'admin','PATCH',{status:'confirmed'})).data.status,'confirmed');
  assert.equal((await call(client+'/cancel','alice','POST',{})).code,409);
  const second=await call('/api/matric-dance/bookings','alice','POST',details);assert.equal((await call('/api/matric-dance/bookings/'+second.data.id+'/cancel','alice','POST',{})).data.status,'cancelled');
  assert.equal((await call('/api/admin/matric-dance/bookings','admin')).data.length,2);
 } finally {server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
