import * as Dialog from '@radix-ui/react-dialog';
import { useForm } from 'react-hook-form';
import { useEffect, useId, useRef, useState } from 'react';
import { X, ShieldCheck, LoaderCircle } from 'lucide-react';
import { api, queryClient } from './api';
import type { Action } from './workflows';
export default function ActionDialog({action,membership,onClose}:{action:Action;membership:string;onClose:()=>void}){
 const {register,handleSubmit,formState:{isSubmitting}}=useForm({defaultValues:Object.fromEntries(action.fields.map(f=>[f.key,f.value??(f.type==='checkbox'?false:'')]))});
 const [error,setError]=useState('');const [key]=useState(()=>crypto.randomUUID());
 const prefix=useId();const errorSummary=useRef<HTMLDivElement>(null);
 const opener=useRef<HTMLElement|null>(document.activeElement instanceof HTMLElement?document.activeElement:null);
 useEffect(()=>{if(error)errorSummary.current?.focus();},[error]);
 async function submit(values:Record<string,any>){setError('');try{
  const data={...action.initial,...values};for(const f of action.fields){if(f.type==='number')data[f.key]=Number(data[f.key]);if(f.type==='datetime-local')data[f.key]=new Date(data[f.key]).toISOString();if(f.type==='days')data[f.key]=String(data[f.key]).split(',').map(Number);}
  if(action.name==='dispatch'){data.allocations=[{collectionId:data._collectionId,grams:data._grams}];delete data._collectionId;delete data._grams;}
  await api('/commands/'+action.name,membership,data,key);await queryClient.invalidateQueries();onClose();
 }catch(e){setError((e as Error).message);}}
 return (
  <Dialog.Root open onOpenChange={open=>{if(!open&&!isSubmitting)onClose();}}>
   <Dialog.Portal>
    <Dialog.Overlay className="dialog-overlay"/>
    <Dialog.Content className="dialog-content" onCloseAutoFocus={event=>{event.preventDefault();if(opener.current?.isConnected)opener.current.focus();else document.getElementById('main')?.focus();}}>
     <div className="row between">
      <span className="eyebrow"><ShieldCheck size={15}/> AUTHORIZED WORKFLOW</span>
      <Dialog.Close className="icon-button" aria-label="Close dialog" disabled={isSubmitting}><X size={20}/></Dialog.Close>
     </div>
     <Dialog.Title>{action.title}</Dialog.Title>
     <Dialog.Description>{action.note||'Changes are saved to the shared API with an audit record. Review the information before submitting.'}</Dialog.Description>
     <form onSubmit={handleSubmit(submit)}>
      <div ref={errorSummary} tabIndex={-1} role="alert" className={error?'error-box':''}>{error}</div>
      <fieldset className="action-fields" disabled={isSubmitting}>
       {action.fields.map(f=>{
        const id=`${prefix}-${f.key}`,help=f.type==='days'?`${id}-help`:undefined;
        const common={...register(f.key),id,'aria-label':f.label,'aria-describedby':help};
        return <label key={f.key} htmlFor={id} className={f.type==='checkbox'?'check-field':'field'}>
         {f.type!=='checkbox'&&<span>{f.label}</span>}
         {f.options?<select {...common} required={f.required}><option value="">Choose…</option>{f.options.map(o=><option key={o}>{o}</option>)}</select>
          :f.type==='textarea'?<textarea rows={3} {...common} required={f.required}/>
          :<input {...common} type={['days','text'].includes(f.type||'text')?'text':f.type} min={f.type==='number'?0:undefined} step={f.type==='number'?1:undefined} required={f.type!=='checkbox'&&f.required}/>}
         {f.type==='checkbox'&&<span>{f.label}</span>}
         {f.type==='days'&&<small id={help}>Comma-separated weekday numbers, e.g. 1,4</small>}
        </label>;
       })}
      </fieldset>
      <div className="dialog-footer">
       <Dialog.Close className="button secondary" disabled={isSubmitting}>Cancel</Dialog.Close>
       <button className="button primary" type="submit" disabled={isSubmitting}>{isSubmitting?<><LoaderCircle size={16} className="spin"/> Saving…</>:'Confirm & save'}</button>
      </div>
     </form>
    </Dialog.Content>
   </Dialog.Portal>
  </Dialog.Root>
 );
}
