(() => {
  const form = document.getElementById('matricForm');
  if (!form) return;
  const api = location.protocol.startsWith('http') ? location.origin : 'https://a2blift.com';
  const draftKey = 'a2b_matric_dance_draft';
  const state = document.getElementById('optionsState');
  const vehicles = document.getElementById('vehicles');
  const message = document.getElementById('formMessage');
  const submit = document.getElementById('submitRequest');
  const retry = document.getElementById('retryOptions');
  let categories = [], lead = 24;
  let draft = {};
  try { draft = JSON.parse(localStorage.getItem(draftKey) || '{}'); } catch (_) {}
  for (const element of form.elements) {
    if (!element.name || element.type === 'radio' || draft[element.name] === undefined) continue;
    if (element.type === 'checkbox') element.checked = !!draft[element.name]; else element.value = draft[element.name];
  }
  function save() {
    const data = {};
    for (const el of form.elements) {
      if (!el.name || (el.type === 'radio' && !el.checked)) continue;
      data[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    }
    localStorage.setItem(draftKey, JSON.stringify(data));
  }
  function toggleReturn() {
    const checked = form.elements.returnRequested.checked;
    document.getElementById('returnFields').hidden = !checked;
    form.elements.returnDate.required = checked; form.elements.returnTime.required = checked;
  }
  form.addEventListener('input', save); form.addEventListener('change', () => { toggleReturn(); save(); }); toggleReturn();
  const auth = document.getElementById('authNotice');
  if (!localStorage.getItem('a2b_token')) {
    auth.append('Log in to send your request. Your details will be saved. ');
    const link = document.createElement('a'); link.href = 'login.html?next=matric-dance.html%23request'; link.textContent = 'Log in or create an account'; auth.append(link);
  }
  async function loadOptions() {
    state.textContent = 'Loading vehicle options…'; retry.hidden = true; vehicles.replaceChildren(); submit.disabled = true;
    try {
      const res = await fetch(`${api}/api/matric-dance/options`); if (!res.ok) throw Error();
      const data = await res.json();
      if (!Array.isArray(data.categories) || !data.categories.length) throw Error();
      categories = data.categories; lead = Number(data.minimumLeadHours) || 24;
      categories.forEach(category => {
        const label = document.createElement('label'); label.className = 'vehicle';
        const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'vehicleType'; radio.value = category.id; radio.required = true; radio.checked = draft.vehicleType === category.id;
        const title = document.createElement('strong'); title.textContent = category.title;
        const detail = document.createElement('span'); detail.textContent = `Up to ${category.maxPassengers} passengers. ${category.description || ''}`;
        label.append(radio, title, detail); vehicles.append(label);
      });
      state.textContent = '';
      document.querySelector('.section-heading p').textContent = `Requests need at least ${lead} hours’ notice. All dates and times are South African time.`;
      submit.disabled = false;
    } catch (_) { state.textContent = 'Vehicle options could not be loaded.'; retry.hidden = false; }
  }
  retry.addEventListener('click', loadOptions); loadOptions();
  form.addEventListener('submit', async event => {
    event.preventDefault(); message.textContent = '';
    const token = localStorage.getItem('a2b_token');
    if (!token) { save(); message.textContent = 'Please log in before sending your request.'; auth.querySelector('a')?.focus(); return; }
    const get = name => form.elements[name].value.trim();
    const vehicle = categories.find(c => c.id === get('vehicleType'));
    const passengers = Number(get('passengers'));
    const pickup = Date.parse(`${get('eventDate')}T${get('pickupTime')}:00+02:00`);
    if (!vehicle || !Number.isInteger(passengers) || passengers < 1 || passengers > Number(vehicle.maxPassengers)) { message.textContent = 'Check that the passenger count fits your selected vehicle.'; return; }
    if (!Number.isFinite(pickup) || pickup < Date.now() + lead * 3600000) { message.textContent = `Choose a pickup at least ${lead} hours from now.`; return; }
    const returnAt = Date.parse(`${get('returnDate')}T${get('returnTime')}:00+02:00`);
    if (form.elements.returnRequested.checked && (!Number.isFinite(returnAt) || returnAt <= pickup || returnAt > pickup + 48 * 3600000)) { message.textContent = 'Choose a return after pickup and within 48 hours.'; return; }
    const payload = {contactName:get('contactName'),contactPhone:get('contactPhone'),school:get('school'),eventDate:get('eventDate'),pickupTime:get('pickupTime'),pickupAddress:get('pickupAddress'),venueAddress:get('venueAddress'),vehicleType:get('vehicleType'),passengers,serviceHours:Number(get('serviceHours')),photoMinutes:Number(get('photoMinutes')),returnRequested:form.elements.returnRequested.checked,adultContactConfirmed:form.elements.adultContactConfirmed.checked};
    if (get('preferredModel')) payload.preferredModel = get('preferredModel'); if (get('notes')) payload.notes = get('notes');
    if (payload.returnRequested) { payload.returnDate = get('returnDate'); payload.returnTime = get('returnTime'); }
    if (Object.values(payload).some(v => typeof v === 'string' && !v)) { message.textContent = 'Please complete the required fields.'; return; }
    submit.disabled = true; submit.textContent = 'Sending…';
    try {
      const res = await fetch(`${api}/api/matric-dance/bookings`, {method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(payload)});
      if (!res.ok) { const body = await res.json().catch(() => ({})); throw Error(body.message || body.error || 'Could not send your request. Please try again.'); }
      localStorage.removeItem(draftKey); form.reset(); toggleReturn(); message.style.color = '#17633b'; message.textContent = 'Request sent. We’ll review it and respond with a quote. Your booking is not yet confirmed.'; submit.textContent = 'Request sent';
    } catch (error) { message.textContent = error.message; submit.disabled = false; submit.textContent = 'Send request'; }
  });
})();
