/* Uses the existing authenticated admin API client; no customer data is HTML. */
async function loadMatricDance() {
  const host=document.getElementById('matricDanceAdmin');host.replaceChildren();
  const message=document.createElement('p');message.textContent='Loading matric dance requests…';host.append(message);
  try {
    const res=await apiFetch('/api/admin/matric-dance/bookings');if(!res.ok)throw Error('Could not load requests. Check your admin session and retry.');
    const bookings=await res.json();host.replaceChildren();
    if(!bookings.length){message.textContent='No matric dance requests yet.';host.append(message);return;}
    const filter=document.createElement('input');filter.type='search';filter.placeholder='Filter by school, contact or reference';filter.className='search-input';filter.setAttribute('aria-label',filter.placeholder);host.append(filter);
    const list=document.createElement('div');host.append(list);const cards=[];
    for(const booking of bookings){const d=booking.details,card=document.createElement('article');card.style.cssText='background:var(--white);border:1px solid var(--border);border-radius:10px;padding:20px;margin-top:16px';
      function line(label,value){const p=document.createElement('p');p.style.cssText='margin:8px 0;line-height:1.6;white-space:pre-wrap';const b=document.createElement('strong');b.textContent=label+': ';p.append(b,document.createTextNode(String(value??'—')));card.append(p);}
      line('Reference',booking.id);line('Status',booking.status);line('Contact',d.contactName+' · '+d.contactPhone);line('School',d.school);line('Pickup',d.eventDate+' '+d.pickupTime+' SAST · '+d.pickupAddress);line('Venue',d.venueAddress);
      line('Vehicle',({luxury:'Luxury',business:'VIP / S-Class preference',luxury_van:'V-Class'}[d.vehicleType]||d.vehicleType)+' · '+d.passengers+' passengers');line('Preference',d.preferredModel||'Category only');line('Requested service',d.serviceHours+' hours · '+d.photoMinutes+' photo minutes');line('Return',d.returnRequested?(d.returnDate||d.eventDate)+' '+d.returnTime+' SAST':'Not requested');line('Customer notes',d.notes||'None');
      if(booking.quoteAmount!=null)line('Quote','R '+Number(booking.quoteAmount).toFixed(2));if(booking.adminNote)line('Customer-visible terms / reply',booking.adminNote);
      const options={requested:['reviewing','quoted','declined'],reviewing:['quoted','declined'],quoted:['quoted','declined'],accepted:['confirmed','declined']}[booking.status]||[];
      if(options.length){const form=document.createElement('form');form.style.cssText='display:flex;flex-wrap:wrap;gap:12px;margin-top:16px;align-items:center';
        const legend=document.createElement('fieldset');legend.style.cssText='border:0;display:flex;gap:12px;flex-wrap:wrap;padding:0';const title=document.createElement('legend');title.textContent='Next status';legend.append(title);
        for(const option of options){const label=document.createElement('label'),radio=document.createElement('input');radio.type='radio';radio.name='status';radio.value=option;radio.required=true;label.append(radio,document.createTextNode(' '+option));legend.append(label);}form.append(legend);
        const amount=document.createElement('input');amount.type='number';amount.min='0.01';amount.step='0.01';amount.max='1000000';amount.placeholder='Quote total (ZAR)';amount.setAttribute('aria-label','Quote total in ZAR');if(booking.quoteAmount!=null)amount.value=booking.quoteAmount;amount.disabled=true;form.append(amount);
        const terms=document.createElement('textarea');terms.maxLength=2000;terms.placeholder='Customer-visible quote: available model, itinerary, inclusions, payment and cancellation terms';terms.setAttribute('aria-label',terms.placeholder);terms.style.cssText='width:100%;min-height:90px;padding:12px';terms.value=booking.adminNote||'';form.append(terms);
        const save=document.createElement('button');save.type='submit';save.className='btn-refresh';save.textContent='Update request';form.append(save);const feedback=document.createElement('p');feedback.setAttribute('role','status');form.append(feedback);
        legend.addEventListener('change',()=>{const status=new FormData(form).get('status');amount.disabled=status!=='quoted';amount.required=status==='quoted';terms.required=status==='quoted';});
        form.addEventListener('submit',async event=>{event.preventDefault();const status=new FormData(form).get('status');if(status==='confirmed'&&!confirm('Confirm the accepted quote only after the vehicle, chauffeur, itinerary and payment arrangements have been checked?'))return;
          save.disabled=true;save.textContent='Saving…';feedback.textContent='';try{const body={status,adminNote:terms.value.trim()};if(status==='quoted')body.quoteAmount=Number(amount.value);const response=await apiFetch('/api/admin/matric-dance/bookings/'+encodeURIComponent(booking.id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw Error(data.message||'Could not update request');await loadMatricDance();}catch(e){feedback.textContent=e.message;save.disabled=false;save.textContent='Update request';}});
        card.append(form);
      }
      list.append(card);cards.push({card,search:(booking.id+' '+d.school+' '+d.contactName+' '+d.contactPhone).toLowerCase()});
    }
    filter.addEventListener('input',()=>{for(const item of cards)item.card.hidden=!item.search.includes(filter.value.trim().toLowerCase());});
  } catch(e){message.textContent=e.message;host.replaceChildren(message);const retry=document.createElement('button');retry.className='btn-refresh';retry.textContent='Retry';retry.onclick=loadMatricDance;host.append(retry);}
}
