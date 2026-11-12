import type { Express, RequestHandler } from "express";
import { z } from "zod";
import { matricDanceRequestSchema, MATRIC_DANCE_CATEGORIES, MATRIC_MIN_LEAD_HOURS, MATRIC_STATUSES, type MatricStatus } from "../shared/matric-dance";
import type { MatricStore } from "./matric-dance-store";
import { requireAuth, requireRole, type AuthedRequest } from "./auth-middleware";
const uuid = z.string().uuid();
const adminPatch = z.object({ status:z.enum(MATRIC_STATUSES), adminNote:z.string().trim().max(2000).optional(), quoteAmount:z.number().positive().max(1000000).multipleOf(0.01).optional() });
const transitions: Record<MatricStatus, MatricStatus[]> = {
  requested:["reviewing","quoted","declined"], reviewing:["quoted","declined"], quoted:["quoted","declined"], accepted:["confirmed","declined"], confirmed:[], declined:[], cancelled:[],
};
export function registerMatricDanceRoutes(app: Express, store: MatricStore, guards: { auth:RequestHandler; admin:RequestHandler } = { auth:requireAuth, admin:requireRole(["admin"]) }) {
  app.get('/api/matric-dance/options', (_req,res) => res.json({ categories:MATRIC_DANCE_CATEGORIES, minimumLeadHours:MATRIC_MIN_LEAD_HOURS }));
  app.post('/api/matric-dance/bookings', guards.auth, async (req:AuthedRequest,res) => {
    const parsed=matricDanceRequestSchema.safeParse(req.body);
    if(!parsed.success) return res.status(400).json({message:parsed.error.issues[0].message});
    try { const own=await store.list(req.auth!.sub);if(own.filter(b=>['requested','reviewing','quoted','accepted'].includes(b.status)).length>=10) return res.status(429).json({message:'You already have 10 open requests. Please manage those before requesting another.'});return res.status(201).json(await store.create(req.auth!.sub,parsed.data)); }
    catch { return res.status(503).json({message:'Booking requests are temporarily unavailable. Please try again.'}); }
  });
  app.get('/api/matric-dance/bookings/me',guards.auth,async(req:AuthedRequest,res)=> {try{return res.json(await store.list(req.auth!.sub));}catch{return res.status(503).json({message:'Could not load booking requests. Please retry.'});}});
  for(const action of ['accept','cancel'] as const) app.post(`/api/matric-dance/bookings/:id/${action}`,guards.auth,async(req:AuthedRequest,res)=>{
    if(!uuid.safeParse(req.params.id).success)return res.status(400).json({message:'Invalid request reference'});
    try {const b=await store.get(String(req.params.id));if(!b||b.userId!==req.auth!.sub)return res.status(404).json({message:'Request not found'});
      if(action==='accept' && req.body?.expectedRevision!==b.revision)return res.status(409).json({message:'This quote changed. Refresh and review the latest amount and terms before accepting.'});
      const allowed=action==='accept'? b.status==='quoted'&&Number(b.quoteAmount)>0 : ['requested','reviewing','quoted','accepted'].includes(b.status);
      if(!allowed)return res.status(409).json({message:'This request cannot be changed now. Please contact A2B for a confirmed booking.'});
      const updated=await store.update(b.id,b.status,{status:action==='accept'?'accepted':'cancelled'},b.revision);return updated?res.json(updated):res.status(409).json({message:'This request changed. Refresh and try again.'});
    }catch{return res.status(503).json({message:'Unable to update request. Please retry.'});}
  });
  app.get('/api/admin/matric-dance/bookings',guards.auth,guards.admin,async(_req,res)=>{try{return res.json(await store.list());}catch{return res.status(503).json({message:'Could not load requests'});}});
  app.patch('/api/admin/matric-dance/bookings/:id',guards.auth,guards.admin,async(req,res)=>{
    const parsed=adminPatch.safeParse(req.body);if(!uuid.safeParse(req.params.id).success||!parsed.success)return res.status(400).json({message:'Invalid status, quote or request reference'});
    if(parsed.data.status!=='quoted' && parsed.data.quoteAmount!==undefined)return res.status(400).json({message:'Only a quote can set a price; accepted quotes cannot be repriced.'});
    try{const b=await store.get(String(req.params.id));if(!b)return res.status(404).json({message:'Request not found'});
      if(!transitions[b.status].includes(parsed.data.status))return res.status(409).json({message:'Invalid status transition. A customer must accept a quote before confirmation.'});
      if(parsed.data.status==='quoted'&&(!parsed.data.quoteAmount||!parsed.data.adminNote))return res.status(400).json({message:'A quote needs an amount and customer-visible terms, vehicle availability and cancellation/payment instructions.'});
      const updated=await store.update(b.id,b.status,parsed.data,b.revision);return updated?res.json(updated):res.status(409).json({message:'Request changed; refresh before updating'});
    }catch{return res.status(503).json({message:'Unable to update request'});}
  });
}
