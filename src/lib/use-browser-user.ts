'use client';
import {useEffect,useState} from 'react';
import type {User} from '@supabase/supabase-js';
import {browserClient} from './browser-client';

export function useBrowserUser(){
 const [user,setUser]=useState<User|null>(null),[ready,setReady]=useState(false);
 useEffect(()=>{
  if(!browserClient){setReady(true);return}
  let active=true,authChanged=false;
  const {data:{subscription}}=browserClient.auth.onAuthStateChange((_event,session)=>{
   authChanged=true;
   if(active){setUser(session?.user??null);setReady(true)}
  });
  void browserClient.auth.getUser().then(({data})=>{
   if(active&&!authChanged){setUser(data.user);setReady(true)}
  }).catch(()=>{if(active)setReady(true)});
  return()=>{active=false;subscription.unsubscribe()};
 },[]);
 return {user,ready};
}
