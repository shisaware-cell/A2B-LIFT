async function loadRoyiAdmin() {
  const root = document.getElementById('royiAdmin'); root.replaceChildren();
  const el = (tag, text, parent = root) => { const n=document.createElement(tag); n.textContent=text; parent.append(n); return n; };
  const error = el('p','Loading…'); error.setAttribute('role','status');
  const monthLabel=el('label','Statement month '); const month=document.createElement('input'); month.type='month'; month.value=new Date().toISOString().slice(0,7); monthLabel.append(month);
  const refresh=el('button','Load statement'); refresh.type='button'; refresh.className='btn';
  const csv=el('button','Download CSV'); csv.type='button'; csv.className='btn';
  const configBox=el('div',''); const report=el('div','');
  async function fetchData(path, opts) { const res=await apiFetch(path,opts); if(!res.ok){const body=await res.json().catch(()=>({}));throw Error(body.message||'Request failed.');}return res.json(); }
  async function load() {
    error.textContent='Loading…'; report.replaceChildren(); configBox.replaceChildren();
    try {
      const [config,statement]=await Promise.all([fetchData('/api/admin/otc/config'),fetchData('/api/admin/otc/statement?month='+encodeURIComponent(month.value))]);
      el('h3','Provider readiness',configBox); el('p',config.message || (config.ready?'Ready':'Not ready'),configBox);
      (config.checks||[]).forEach(c=>el('p',`${c.label}: ${c.configured?'Configured':'Missing'}`,configBox));
      el('h3',`Statement ${statement.period}`,report); el('p','Figures below are for the selected month except the all-time verified unpaid balance.',report); const sum=statement.summary||{};
      [['Completed orders',sum.completedOrders],['Volume (ZAR)',sum.volumeZar],['Commission earned (ZAR)',sum.commissionEarnedZar],['Recorded paid (ZAR)',sum.recordedPaidZar],['All-time verified unpaid balance (ZAR)',sum.balanceZar]].forEach(([label,value])=>el('p',`${label}: ${value ?? '—'}`,report));
      el('h3','Orders',report); if(!statement.orders?.length)el('p','No orders for this period.',report);else statement.orders.forEach(o=>el('p',`${o.id || '—'} · ${o.status || '—'} · ${o.targetZar ?? '—'} ZAR`,report));
      el('h3','Recorded settlements',report); if(!statement.payouts?.length)el('p','No settlements recorded for this period.',report);else statement.payouts.forEach(p=>el('p',`${p.reference || '—'} · ${p.amountZar ?? '—'} ZAR · ${p.paidAt || '—'}`,report));
      error.textContent='';
    } catch(e){error.textContent=e.message;}
  }
  refresh.onclick=load;
  csv.onclick=async()=>{error.textContent='';try{const res=await apiFetch('/api/admin/otc/statement?month='+encodeURIComponent(month.value)+'&format=csv');if(!res.ok)throw Error('Could not download CSV.');const url=URL.createObjectURL(await res.blob());const a=document.createElement('a');a.href=url;a.download=`celbux-statement-${month.value}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){error.textContent=e.message;}};
  const section=el('div',''); el('h3','Record an already-paid settlement',section); el('p','This only records a settlement already made. No money is sent.',section);
  const form=document.createElement('form');section.append(form);
  function field(label,name,type,required=true){const l=el('label',label,form);l.style.cssText='display:block;margin:12px 0';const input=document.createElement('input');input.name=name;input.type=type;input.required=required;input.style.cssText='display:block;padding:8px;max-width:350px;width:100%';l.append(input);return input;}
  const amount=field('Amount (ZAR)','amountZar','number');amount.min='0.01';amount.step='0.01';field('Reference','reference','text');const methods=el('fieldset','',form);methods.style.cssText='border:0;padding:0;margin:12px 0';el('legend','Method',methods);[['BANK_EFT','Bank EFT'],['USDT_TRC20','USDT TRC-20'],['OTHER','Other']].forEach(([value,label])=>{const l=el('label','',methods);l.style.marginRight='16px';const radio=document.createElement('input');radio.type='radio';radio.name='method';radio.value=value;radio.required=true;l.append(radio,document.createTextNode(' '+label));});const paid=field('Paid date (South Africa time)','paidAt','date');paid.max=new Date(Date.now()+7200000).toISOString().slice(0,10);field('Notes (optional)','notes','text',false);
  const status=el('p','',form);status.setAttribute('role','status');const submit=el('button','Record settlement',form);submit.type='submit';submit.className='btn';
  form.onsubmit=async e=>{e.preventDefault();if(Date.parse(`${form.elements.namedItem('paidAt').value}T00:00:00+02:00`)>Date.now()){status.textContent='Paid date cannot be in the future.';return;}if(!confirm('Record this already-paid settlement? No money will be sent.'))return;submit.disabled=true;status.textContent='Recording…';try{await fetchData('/api/admin/otc/payouts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amountZar:Number(form.elements.namedItem('amountZar').value),reference:form.elements.namedItem('reference').value.trim(),method:form.elements.namedItem('method').value.trim(),paidAt:`${form.elements.namedItem('paidAt').value}T00:00:00+02:00`,notes:form.elements.namedItem('notes').value.trim()})});form.reset();status.textContent='Settlement recorded.';await load();}catch(err){status.textContent=err.message;}finally{submit.disabled=false;}};
  await load();
}
