'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {createClient,type User} from '@supabase/supabase-js';
const db=process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY):null;
type BasketItem={sku:string;quantity:number;cost?:number};
type Order={orderNo:string;start:string;end:string};
type Slot={id:string;start:string;end:string};
export default function TescoBasket(){
 const [slots,setSlots]=useState<Slot[]>([]);
 const [user,setUser]=useState<User|null>(null),[ready,setReady]=useState(false),[loading,setLoading]=useState(false),[finding,setFinding]=useState(false),[items,setItems]=useState<BasketItem[]>([]),[guidePrice,setGuidePrice]=useState<number|null>(null),[order,setOrder]=useState<Order|null>(null),[message,setMessage]=useState('');
 useEffect(()=>{if(!db){setReady(true);return}db.auth.getUser().then(x=>{setUser(x.data.user);setReady(true)}).catch(()=>setReady(true))},[]);
 async function token(){if(!db)throw Error('Not configured');const r=await db.auth.getSession();if(!r.data.session)throw Error('Sign in on the chalkboard first.');return r.data.session.access_token}
 async function load(){setLoading(true);setMessage('');try{const t=await token();const r=await fetch('/api/tesco-test?action=basket',{headers:{Authorization:'Bearer '+t},cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error||'Unable to read Tesco basket');setItems(d.items||[]);setGuidePrice(typeof d.guidePrice==='number'?d.guidePrice:null)}catch(e){setMessage(e instanceof Error?e.message:'Unable to read basket')}finally{setLoading(false)}}
 async function find(slotId?:string){setFinding(true);setMessage('');try{const t=await token();const r=await fetch('/api/tesco-test?action=sync-order',{method:'POST',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify(slotId?{slotId}:{})});const d=await r.json();if(!r.ok)throw Error(d.error||'Unable to find delivery slot');setSlots(d.requiresConfirmation?d.slots||[]:[]);setOrder(d.found?{orderNo:d.orderNo||'Reserved slot',start:d.start,end:d.end}:null);setMessage(d.message||'Slot lookup completed')}catch(e){setMessage(e instanceof Error?e.message:'Unable to find slot')}finally{setFinding(false)}}
 useEffect(()=>{if(user)void load()},[user]);
 const button={padding:'13px 18px',borderRadius:10,border:'1px solid #c5d4c8',fontSize:17,background:'#e5eee6',color:'#193d2e',cursor:'pointer'};
 return <main style={{minHeight:'100dvh',padding:20,background:'#edf3ed',fontFamily:'Arial,sans-serif',color:'#20392e'}}><section style={{maxWidth:650,margin:'0 auto',padding:24,background:'#fff',borderRadius:18}}>
 <Link href="/basket">← Back to whiteboard</Link><h1>🧺 Tesco Basket</h1><p>Products already in your Tesco basket, separate from the shopping whiteboard.</p>
 {!ready?<p>Checking sign-in…</p>:!user?<p>Sign in on the <Link href="/basket">whiteboard</Link> first.</p>:<>
 <div style={{display:'flex',gap:12,flexWrap:'wrap'}}><button style={button} onClick={()=>void find()} disabled={finding}>{finding?'Finding…':'Find slot'}</button><button style={button} onClick={()=>void load()} disabled={loading}>{loading?'Loading…':'Refresh Tesco basket'}</button></div>
 {slots.length>0&&<section style={{padding:14,background:'#eef5ef',borderRadius:12,marginTop:18}}><h2>Confirm your reserved slot</h2><p>Only select a slot that matches the reservation shown in your Tesco account.</p>{slots.map(slot=><button key={slot.id} disabled={finding} style={{...button,display:'block',marginBottom:10}} onClick={()=>void find(slot.id)}>{new Date(slot.start).toLocaleDateString('en-GB',{timeZone:'Europe/London',weekday:'long',day:'numeric',month:'long'})} · {new Date(slot.start).toLocaleTimeString('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit'})}–{new Date(slot.end).toLocaleTimeString('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit'})} · Add to calendar</button>)}</section>}
 {order&&<section style={{padding:14,background:'#eef5ef',borderRadius:12,marginTop:18}}><h2>Next Tesco order</h2><p><strong>Order:</strong> {order.orderNo}</p><p><strong>Delivery:</strong> {new Date(order.start).toLocaleDateString('en-GB',{timeZone:'Europe/London',weekday:'long',day:'numeric',month:'long'})} · {new Date(order.start).toLocaleTimeString('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit'})}–{new Date(order.end).toLocaleTimeString('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit'})}</p></section>}
 <h2>Products in Tesco basket</h2>{!loading&&!items.length&&<p>No products returned.</p>}
 {items.map(item=><div key={item.sku} style={{display:'flex',justifyContent:'space-between',padding:'12px 0',borderBottom:'1px solid #d9e3db'}}><span>Product SKU {item.sku}</span><strong>× {item.quantity}</strong></div>)}
 {guidePrice!==null&&<p><strong>Guide price:</strong> £{guidePrice.toFixed(2)}</p>}
 {message&&<p role="status">{message} {/tesco.*(session|expired|reconnect)/i.test(message)&&<Link href="/tesco-reconnect?returnTo=%2Ftesco-basket">Reconnect Tesco</Link>}</p>}
 </>}</section></main>;
}
