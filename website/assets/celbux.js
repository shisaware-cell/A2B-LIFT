(() => {
  const api = location.protocol.startsWith('http') ? location.origin : 'https://a2blift.com';
  const token = () => localStorage.getItem('a2b_token');
  const auth = () => ({Authorization:`Bearer ${token()}`});
  async function request(path, options = {}) {
    const res = await fetch(api + path, options); const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(res.status === 401 ? 'Please log in again.' : data.message || 'Unable to complete the request. Please try again.'); return data;
  }
  const make = (tag, text, parent) => {const el=document.createElement(tag); el.textContent=text; if(parent) parent.append(el); return el;};
  const button = (text, parent, handler) => {const b=make('button',text,parent); b.type='button'; b.addEventListener('click',handler); return b;};
  const date = v => v ? new Date(v).toLocaleString('en-ZA',{timeZone:'Africa/Johannesburg'}) + ' SAST' : '—';
  const money = v => Number.isFinite(Number(v)) ? `R${Number(v).toFixed(2)}` : '—';
  const active = ['creating','awaiting_deposit','processing','review_required'];
  let timer, expiryTimer, selectedOrder;
  const history = document.getElementById('celbuxHistory');
  const historyRetry = document.getElementById('historyRetry');
  function renderOrder(order, host, detail) {
    host.replaceChildren(); host.className = detail ? 'panel' : 'record';
    make('h3',`Order ${order.id}`,host); make('p',`Status: ${(order.status || 'unknown').replaceAll('_',' ')}`,host);
    make('p',`${money(order.targetZar)} voucher · ${order.crypto || ''} · ${order.network || ''}`,host);
    make('p',`Created: ${date(order.createdAt)}`,host);
    if (detail && order.status === 'awaiting_deposit' && Date.parse(order.expiresAt) > Date.now() && order.depositAddress && order.exactAmount != null) {
      make('p',`Send exactly ${order.exactAmount} ${order.crypto} on ${order.network}.`,host);
      make('p',`Deposit address: ${order.depositAddress}`,host); make('p',`Expires: ${date(order.expiresAt)}`,host);
      for (const [label,value] of [['Copy address',order.depositAddress],['Copy amount',String(order.exactAmount)]]) {
        const b=button(label,host,async()=>{if(Date.parse(order.expiresAt)<=Date.now()){renderOrder(order,host,true);return;}try {await navigator.clipboard.writeText(value); b.textContent='Copied';} catch (_) {b.textContent='Copy failed';}});
      }
      make('p','Only use the network shown. Order completion is confirmed by the provider, not the timer.',host);
      clearTimeout(expiryTimer); expiryTimer=setTimeout(()=>renderOrder(order,host,true),Math.max(0,Date.parse(order.expiresAt)-Date.now()+1));
    } else if (detail && order.status === 'awaiting_deposit' && Date.parse(order.expiresAt) <= Date.now()) {
      make('p','The deposit instruction time has elapsed. Refresh for provider verification before taking action.',host);
    }
    const error=make('p','',host); error.className='error';
    button('Refresh status',host,async()=>{try{await showOrder(order.id);}catch(e){error.textContent=e.message;}});
  }
  function orderVisible() { const page = document.getElementById('page-celbux'); return !document.hidden && (!page || page.classList.contains('active')); }
  async function showOrder(id) {
    selectedOrder=id; const data=await request(`/api/otc/orders/${encodeURIComponent(id)}`,{headers:auth()});
    let panel=document.getElementById('orderPanel'); if(!panel){panel=document.getElementById('celbuxDetail');} panel.hidden=false; renderOrder(data.order,panel,true);
    clearTimeout(timer); if(active.includes(data.order.status) && orderVisible()) timer=setTimeout(()=>{if(orderVisible())showOrder(id).catch(()=>{});},15000);
  }
  async function loadHistory() {
    if(!history)return;
    history.textContent='Loading orders…'; if(historyRetry) historyRetry.hidden=true;
    if(!token()){history.replaceChildren();make('p','Log in to see your orders.',history);const a=make('a','Log in',history);a.href='login.html?next=buy-celbux.html';return;}
    try {const list=await request('/api/otc/orders/me',{headers:auth()}); if(!Array.isArray(list)) throw Error('Unable to load orders.'); history.replaceChildren(); if(!list.length){history.textContent='No voucher orders yet.';return;} list.forEach(o=>{const div=document.createElement('div');history.append(div);renderOrder(o,div,false);});}
    catch(e){history.textContent=e.message;if(historyRetry)historyRetry.hidden=false;}
  }
  if(historyRetry)historyRetry.addEventListener('click',loadHistory);
  window.loadCelbuxHistory=loadHistory;
  document.addEventListener('visibilitychange',()=>{clearTimeout(timer);if(orderVisible()&&selectedOrder)showOrder(selectedOrder).catch(()=>{});});
  if(history && document.getElementById('quoteForm'))loadHistory();
  const form=document.getElementById('quoteForm'); if(!form)return;
  const configStatus=document.getElementById('configStatus'), configRetry=document.getElementById('configRetry'), quotePanel=document.getElementById('quotePanel'), error=document.getElementById('quoteError');
  let config, quote;
  function choices(host, name, values, change){host.replaceChildren();values.forEach((value,i)=>{const label=document.createElement('label');label.className='choice';const input=document.createElement('input');input.type='radio';input.name=name;input.value=value;input.required=true;input.checked=i===0;input.addEventListener('change',change);label.append(input,document.createTextNode(' '+value));host.append(label);});}
  function networks(){const chosen=form.querySelector('[name=crypto]:checked')?.value;const asset=config.assets.find(a=>a.crypto===chosen);choices(document.getElementById('networkChoices'),'network',asset?.networks||[],()=>{quotePanel.hidden=true;});quotePanel.hidden=true;}
  async function loadConfig(){configStatus.textContent='Checking availability…';configRetry.hidden=true;form.querySelector('button').disabled=true;try{config=await request('/api/otc/config');configStatus.textContent=config.message || (config.ready?'Available':'Currently unavailable.');if(!config.ready){configRetry.hidden=false;return;}if(!Array.isArray(config.assets)||!config.assets.length)throw Error('No assets are available.');choices(document.getElementById('cryptoChoices'),'crypto',config.assets.map(a=>a.crypto),networks);networks();form.elements.zar.min=config.limits.minZar;form.elements.zar.max=config.limits.maxZar;document.getElementById('limits').textContent=`Allowed voucher amount: ${money(config.limits.minZar)}–${money(config.limits.maxZar)}.`;form.querySelector('button').disabled=false;}catch(e){configStatus.textContent=e.message;configRetry.hidden=false;}}
  configRetry.addEventListener('click',loadConfig);loadConfig();
  form.addEventListener('input',()=>{quotePanel.hidden=true;quote=null;});
  form.addEventListener('submit',async e=>{e.preventDefault();error.textContent='';if(!token()){location.href='login.html?next=buy-celbux.html';return;}const b=form.querySelector('button');b.disabled=true;b.textContent='Getting quote…';try{const p=new URLSearchParams({crypto:form.elements.crypto.value,network:form.elements.network.value,zar_amount:form.elements.zar.value});quote=(await request('/api/otc/quote?'+p,{headers:auth()})).quote;quotePanel.replaceChildren();quotePanel.hidden=false;quotePanel.className='panel';make('h2','Review your quote',quotePanel);make('p',`Voucher amount: ${money(quote.targetZar)}`,quotePanel);make('p',`Required: ${quote.cryptoRequired} ${quote.crypto} on ${quote.network}`,quotePanel);make('p',`Rate: ${money(quote.rateZar)} per ${quote.crypto}`,quotePanel);make('p',`Total fee: ${money(quote.totalFeeZar)}`,quotePanel);make('p',`Gross crypto required: ${quote.cryptoRequired} ${quote.crypto}`,quotePanel);make('p',`Quote expires: ${date(quote.validUntil)}`,quotePanel);const label=make('label','SMS recipient phone',quotePanel);const phone=document.createElement('input');phone.type='tel';phone.required=true;phone.autocomplete='tel';label.append(phone);const consentLabel=make('label','',quotePanel);const consent=document.createElement('input');consent.type='checkbox';consentLabel.append(consent,document.createTextNode(` I confirm this phone number may be shared with ROYI/247 for the SMS voucher and I will use the ${quote.network} network.`));const msg=make('p','',quotePanel);msg.className='error';const create=button('Create order',quotePanel,async()=>{msg.textContent='';if(!phone.value.trim()||!consent.checked){msg.textContent='Enter the SMS phone number and confirm the network and phone sharing.';return;}if(!confirm(`Create an order for ${money(quote.targetZar)}? Your phone number will be shared with ROYI/247. Send only on ${quote.network}. No crypto is sent by this action.`))return;create.disabled=true;create.textContent='Creating order…';try{const result=await request('/api/otc/orders',{method:'POST',headers:{...auth(),'Content-Type':'application/json'},body:JSON.stringify({quoteId:quote.id,recipientPhone:phone.value.trim(),consent:true})});quotePanel.hidden=true;await showOrder(result.order.id);loadHistory();}catch(err){msg.textContent=err.message;create.disabled=false;create.textContent='Create order';}});create.className='primary';}catch(err){error.textContent=err.message;}finally{b.disabled=false;b.textContent='Get live quote';}});
})();
