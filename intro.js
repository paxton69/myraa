'use strict';
/* MYRAA intro boot. Runs before first paint (blocking, tiny). Never hides content:
   the intro is pure CSS animation that always ends visible; this only picks full vs quick. */
(()=>{
 const root=document.documentElement;
 root.classList.add('js');
 let quick=false;
 try{
  const k='myraa.site.intro.t',now=Date.now(),t=Number(localStorage.getItem(k)||0);
  quick=t>0&&now-t<10*60*1000;
  localStorage.setItem(k,String(now));
 }catch{}
 if(quick)root.classList.add('intro-quick');
})();
