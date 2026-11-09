const initialized=new WeakSet<Element>();
function setupPublicContent(){
 document.querySelectorAll<HTMLElement>('[data-carousel]').forEach(carousel=>{
  if(initialized.has(carousel))return;initialized.add(carousel);
  const slides=Array.from(carousel.querySelectorAll<HTMLElement>('[data-slide]'));
  const dots=Array.from(carousel.querySelectorAll<HTMLButtonElement>('[data-slide-to]'));
  const pause=carousel.querySelector<HTMLButtonElement>('[data-carousel-pause]')!;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let index=0,paused=reduced.matches,hovering=false;
  const updatePause=()=>{pause.textContent=paused?'▶':'Ⅱ';pause.setAttribute('aria-label',paused?'Play slideshow':'Pause slideshow');};
  function show(next:number){index=(next+slides.length)%slides.length;slides.forEach((slide,i)=>{slide.classList.toggle('is-active',i===index);slide.setAttribute('aria-hidden',String(i!==index));});dots.forEach((dot,i)=>dot.setAttribute('aria-pressed',String(i===index)));carousel.querySelector('[data-slide-count]')!.textContent=`0${index+1} / 03`;}
  dots.forEach((dot,i)=>dot.addEventListener('click',()=>{show(i);paused=true;updatePause();}));
  carousel.querySelector('[data-carousel-next]')?.addEventListener('click',()=>{show(index+1);paused=true;updatePause();});
  pause.addEventListener('click',()=>{paused=!paused;updatePause();});
  carousel.addEventListener('mouseenter',()=>{hovering=true;});carousel.addEventListener('mouseleave',()=>{hovering=false;});
  reduced.addEventListener('change',()=>{if(reduced.matches){paused=true;updatePause();}});
  updatePause();
  const timer=window.setInterval(()=>{
   if(!carousel.isConnected){clearInterval(timer);return;}
   if(!paused&&!hovering&&!document.hidden&&!carousel.contains(document.activeElement))show(index+1);
  },6500);
 });
 const tokenInput=document.querySelector<HTMLInputElement>('form[data-public-kind="unsubscribe"] input[name="token"]');
 if(tokenInput&&location.hash.startsWith('#token=')){
  const token=location.hash.slice(7);if(/^[a-f0-9]{64}$/.test(token)){tokenInput.value=token;history.replaceState(null,'',location.pathname);}
 }
}
setupPublicContent();
new MutationObserver(setupPublicContent).observe(document.documentElement,{childList:true,subtree:true});

document.addEventListener('submit',async event=>{
 const form=event.target;
 if(!(form instanceof HTMLFormElement)||!form.dataset.publicKind)return;
 event.preventDefault();
 if(form.dataset.sending==='true'||!form.reportValidity())return;
 const status=form.querySelector<HTMLElement>('[data-form-status]')!;
 const data=new FormData(form),kind=form.dataset.publicKind;
 const field=(key:string)=>String(data.get(key)||'').trim();
 const button=form.querySelector<HTMLButtonElement>('button[type="submit"],button:not([type])');
 const original=button?.textContent||'';
 form.dataset.sending='true';form.setAttribute('aria-busy','true');
 form.querySelector('fieldset')?.setAttribute('disabled','');if(button){button.disabled=true;button.textContent='Sending…';}
 status.replaceChildren();status.textContent='Saving your request…';status.classList.remove('is-error');
 try{
  const requestKey=form.dataset.requestKey||(form.dataset.requestKey=crypto.randomUUID());
  const body=kind==='enquiry'?{kind:form.dataset.enquiryKind,name:field('name'),email:field('email'),phone:field('phone'),businessName:field('businessName'),sector:field('sector'),location:field('location'),service:field('service'),message:field('message'),preferredContact:field('preferredContact'),consent:data.get('consent')==='on',website:field('website'),requestKey}:kind==='newsletter'?{email:field('email'),consent:data.get('consent')==='on',website:field('website')}:{token:field('token')};
  const endpoint=kind==='enquiry'?'enquiries':kind==='newsletter'?'newsletter':'newsletter/unsubscribe';
  const response=await fetch(`${import.meta.env.VITE_API_URL||''}/api/v1/public/${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
  const result=await response.json();
  if(!response.ok){
   const details=result.error?.details?.fieldErrors;
   throw new Error((result.error?.message||'Your request was not saved.')+(details?' '+Object.values(details).flat().join(' '):''));
  }
  status.textContent=(result.reference?`Request saved · ${result.reference}. `:'')+result.message;
  if(result.unsubscribeToken){const link=document.createElement('a');link.href='/newsletter-preferences#token='+result.unsubscribeToken;link.textContent='Save your private unsubscribe link';link.className='unsubscribe-link';status.append(document.createElement('br'),link);}
  form.reset();delete form.dataset.requestKey;
 }catch(error){status.classList.add('is-error');status.textContent=error instanceof Error&&error.name==='TimeoutError'?'The connection timed out. Saving is not confirmed. Retry the same form to avoid a duplicate.':error instanceof Error?error.message:'Could not save your request. Please try again.';}
 finally{form.dataset.sending='false';form.removeAttribute('aria-busy');form.querySelector('fieldset')?.removeAttribute('disabled');if(button){button.disabled=false;button.textContent=original;}status.focus();}
});
