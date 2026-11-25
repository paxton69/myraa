'use strict';
/* MYRAA public site. No frameworks, no third-party scripts, DOM built with textContent only. */

/* ---------- Verified downloads (fail closed) ---------- */
const targetIds={android:'android-release'}; // Windows and iPhone are "Coming soon" in index.html
const allowed=(url,ext)=>{
 try{const u=new URL(url);return u.protocol==='https:'&&u.hostname==='github.com'&&
  /^\/[^/]+\/[^/]+\/releases\/download\/[^/]+\/[^/]+$/.test(u.pathname)&&u.pathname.toLowerCase().endsWith(ext)&&!u.search&&!u.hash}
 catch{return false}
};
function addText(parent,tag,content,className){const e=document.createElement(tag);if(className)e.className=className;e.textContent=content;parent.appendChild(e);return e}
function render(type,release){
 const box=document.getElementById(targetIds[type]);if(!box)return;box.replaceChildren();
 if(!release||!allowed(release.url,type==='windows'?'.exe':'.apk')||
   !/^[a-f0-9]{64}$/i.test(release.sha256||'')||
   !/^[0-9]+(?:\.[0-9]+){1,3}$/.test(release.version||'')||
   !Number.isSafeInteger(release.bytes)||release.bytes<=0){
  const b=document.createElement('button');b.type='button';b.className='button subtle';b.disabled=true;
  b.textContent='Not released yet';box.appendChild(b);
  addText(box,'p','A verified installer/APK link will appear here after publication.','quiet small');
  return;
 }
 addText(box,'strong','Version '+release.version+' · '+(release.bytes/(1024*1024)).toFixed(1)+' MiB');
 const link=document.createElement('a');link.className='button';link.href=release.url;
 link.rel='noopener noreferrer';link.target='_blank';link.textContent='Download from GitHub';box.appendChild(link);
 addText(box,'small','SHA-256: '+release.sha256,'code');
 if(typeof release.notes==='string')addText(box,'p',release.notes.slice(0,300));
}
fetch('releases.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('no manifest');return r.json()})
 .then(data=>{for(const k of Object.keys(targetIds))render(k,data&&data[k])})
 .catch(()=>{for(const k of Object.keys(targetIds))render(k,null)});

/* ---------- Apex waitlist: POST {email, consent:true} to /v1/waitlist ---------- */
(()=>{
 const form=document.getElementById('waitlist');if(!form)return;
 const email=document.getElementById('wl-email'),consent=document.getElementById('wl-consent');
 const submit=document.getElementById('wl-submit'),status=document.getElementById('wl-status');
 const emailOk=v=>v.length>=6&&v.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
 const say=(msg,kind)=>{status.textContent=msg;status.className='wl-status'+(kind?' '+kind:'')};
 let busy=false;
 const sync=()=>{submit.disabled=busy||!consent.checked||!emailOk(email.value.trim())};
 email.addEventListener('input',sync);consent.addEventListener('change',sync);sync();
 form.addEventListener('submit',async ev=>{
  ev.preventDefault();
  const v=email.value.trim();
  if(!emailOk(v)){say('Please enter a valid email address.','warn');email.focus();return}
  if(!consent.checked){say('Please tick the consent box to join.','warn');consent.focus();return}
  busy=true;sync();say('Sending...');
  try{
   const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),10000);
   const r=await fetch('/v1/waitlist',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({email:v,consent:true}),credentials:'omit',cache:'no-store',signal:ctl.signal});
   clearTimeout(t);
   let data=null;try{data=await r.json()}catch{}
   if(r.ok&&data&&data.ok===true){say('Thanks. You are on the Apex waitlist.','ok');form.reset();}
   else if(r.status===429)say('Too many attempts. Please try again later.','warn');
   else if(r.status===400)say('That email could not be accepted. Please check it and try again.','warn');
   else say('Waitlist opens soon. Your email was not saved; please try again later.','warn');
  }catch{say('Waitlist opens soon. Your email was not saved; please try again later.','warn')}
  finally{busy=false;sync()}
 });
})();

/* ---------- Visual layer (MYRAA Holo). Everything below is decoration: if it fails, content stays visible. ---------- */
const mm=q=>window.matchMedia?window.matchMedia(q):{matches:false};
const reduceMQ=mm('(prefers-reduced-motion: reduce)');
const fineMQ=mm('(hover: hover) and (pointer: fine)');

/* One shared rAF ticker so the starfield and the orb shader render in the same frame. */
const Tick=(()=>{
 const fns=new Set();let raf=0;
 const run=now=>{raf=0;for(const f of fns){try{f(now)}catch{fns.delete(f)}}if(fns.size)raf=requestAnimationFrame(run)};
 return{add(f){fns.add(f);if(!raf)raf=requestAnimationFrame(run)},del(f){fns.delete(f)}};
})();

/* Recommend the download that matches this device (visual only; both stay available). */
(()=>{
 const ua=navigator.userAgent||'';
 const os=/Android/i.test(ua)?'android':/Windows/i.test(ua)?'windows':null;if(!os)return;
 const card=document.querySelector('.platform[data-os="'+os+'"]');if(!card)return;
 card.classList.add('is-match');
 const dev=card.querySelector('.device');
 const b=document.createElement('span');b.className='badge match';b.textContent='Recommended for this device';
 if(dev)dev.after(b);
})();

/* ---------- Hero galaxy + HUD rings: Canvas2D, DPR cap 1.75, paused when hidden/offscreen/reduced ---------- */
(()=>{
 const canvas=document.getElementById('starfield');if(!canvas||!canvas.getContext)return;
 const ctx=canvas.getContext('2d',{alpha:true});if(!ctx)return;
 const stage=document.querySelector('.orb-stage'),orb=document.getElementById('orb');
 let w=0,h=0,dpr=1,stars=[],dust=[],visible=true,last=0,t0=performance.now(),cx=0,cy=0,oR=120,wide=true;
 const introDur=document.documentElement.classList.contains('intro-quick')?.35:1.4;
 const rand=(a,b)=>a+Math.random()*(b-a);
 const palette=['255,255,255','190,250,238','200,201,255','255,255,255','180,230,255'];
 function build(){
  const n=Math.min(460,Math.round(w*h/2400)),arms=3;stars=[];dust=[];
  for(let i=0;i<n;i++){
   const arm=i%arms,r=Math.pow(Math.random(),.7),spread=rand(-.35,.35)*(1-r*.5);
   stars.push({r,a:arm*(2*Math.PI/arms)+r*4.2+spread,s:rand(.4,1.6)*(r<.2?1.3:1),c:palette[i%palette.length],tw:rand(0,6.28),tws:rand(.6,1.8),base:rand(.35,.95)});
  }
  for(let i=0;i<Math.round(n*.45);i++)dust.push({x:Math.random(),y:Math.random(),s:rand(.3,1.1),tw:rand(0,6.28),tws:rand(.3,1.2),base:rand(.15,.6)});
 }
 function measure(){
  // Layout reads happen only here (resize), never per frame. The stage box has no transform, so the intro zoom does not skew it.
  const cr=canvas.getBoundingClientRect();
  wide=w>960;
  if(stage&&orb){const sr=stage.getBoundingClientRect();cx=sr.left-cr.left+sr.width/2;cy=sr.top-cr.top+sr.height/2;oR=orb.offsetWidth*.36}
  else{cx=wide?w*.72:w*.5;cy=wide?h*.5:h*.28;oR=Math.min(w,h)*.15}
 }
 function resize(){
  dpr=Math.min(1.75,window.devicePixelRatio||1);
  w=Math.max(1,canvas.clientWidth||1);h=Math.max(1,canvas.clientHeight||1);
  canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);measure();build();draw(performance.now());
 }
 function ring(r,dash,off,color,lw){ctx.beginPath();ctx.setLineDash(dash);ctx.lineDashOffset=off;ctx.strokeStyle=color;ctx.lineWidth=lw;ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke()}
 function draw(now){
  const still=reduceMQ.matches,t=still?3:(now-t0)/1000;
  ctx.clearRect(0,0,w,h);
  for(const d of dust){
   const a=d.base*(.6+.4*Math.sin(d.tw+t*d.tws));
   ctx.fillStyle='rgba(255,255,255,'+a.toFixed(3)+')';ctx.fillRect(d.x*w,d.y*h,d.s,d.s);
  }
  const ip=still?1:Math.min(1,t/introDur),ie=1-Math.pow(1-ip,3);
  const R=Math.max(w,h)*(wide?.55:.75)*(.38+.62*ie),tilt=.42,rot=still?0:t*.018+(1-ie)*.9;
  for(const s of stars){
   const ang=s.a+rot*(1.4-s.r),x=cx+Math.cos(ang)*s.r*R,y=cy+Math.sin(ang)*s.r*R*tilt;
   if(x<-4||x>w+4||y<-4||y>h+4)continue;
   const a=s.base*(.65+.35*Math.sin(s.tw+t*s.tws));
   ctx.fillStyle='rgba('+s.c+','+a.toFixed(3)+')';ctx.fillRect(x,y,s.s,s.s);
  }
  // Holographic HUD around the orb: tick ring, two counter-rotating arcs, an orbit with a satellite.
  ctx.save();ctx.globalAlpha=ie;
  ring(oR*1.22,[1.5,9],-t*6,'rgba(124,219,255,.34)',1);
  ctx.setLineDash([]);ctx.lineWidth=1.6;
  for(let k=0;k<2;k++){
   const a0=t*.35*(k?-1:1)+k*Math.PI,r=oR*(k?1.5:1.38);
   ctx.strokeStyle=k?'rgba(139,140,255,.55)':'rgba(62,230,196,.6)';
   ctx.beginPath();ctx.arc(cx,cy,r,a0,a0+.75);ctx.stroke();
   ctx.beginPath();ctx.arc(cx,cy,r,a0+Math.PI,a0+Math.PI+.28);ctx.stroke();
  }
  const ox=oR*1.85,oy=oR*.42,sa=t*.5;
  ctx.lineWidth=1;ctx.strokeStyle='rgba(180,200,255,.16)';ctx.beginPath();ctx.ellipse(cx,cy,ox,oy,-.32,0,Math.PI*2);ctx.stroke();
  const c=Math.cos(-.32),s=Math.sin(-.32),ex=Math.cos(sa)*ox,ey=Math.sin(sa)*oy,sx=cx+ex*c-ey*s,sy=cy+ex*s+ey*c;
  if(Math.sin(sa)>-.2||Math.hypot(sx-cx,sy-cy)>oR){ // hide behind the sphere
   ctx.fillStyle='rgba(124,219,255,.95)';ctx.beginPath();ctx.arc(sx,sy,2.4,0,Math.PI*2);ctx.fill();
   ctx.fillStyle='rgba(124,219,255,.18)';ctx.beginPath();ctx.arc(sx,sy,7,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
 }
 function loop(now){if(now-last>=15){last=now;draw(now)}}
 const run=()=>{if(visible&&!document.hidden&&!reduceMQ.matches)Tick.add(loop);else Tick.del(loop)};
 let rt=0;window.addEventListener('resize',()=>{clearTimeout(rt);rt=setTimeout(resize,150)},{passive:true});
 document.addEventListener('visibilitychange',run);
 if('IntersectionObserver' in window)new IntersectionObserver(es=>{visible=es[0].isIntersecting;run()}).observe(canvas);
 if(reduceMQ.addEventListener)reduceMQ.addEventListener('change',()=>{run();draw(performance.now())});
 // Fonts/intro can shift the stage slightly after first paint: re-measure once things settle.
 window.addEventListener('load',()=>{measure()},{once:true});
 resize();run();
})();

/* ---------- Holographic orb: tiny raw WebGL1 shader. CSS orb stays as fallback until the first frame renders. ---------- */
(()=>{
 const cv=document.getElementById('orb-gl'),orb=document.getElementById('orb');if(!cv||!orb)return;
 let gl=null;
 try{gl=cv.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,powerPreference:'low-power'})}catch{}
 if(!gl){cv.remove();return}
 const VS='attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
 const FS=`precision mediump float;
uniform vec2 uRes;uniform float uTime;uniform float uEnergy;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
vec3 holo(float t){vec3 a=vec3(.243,.902,.769),b=vec3(.486,.859,1.),c=vec3(.545,.549,1.),d=vec3(.706,.549,1.);
 t=fract(t)*3.;return t<1.?mix(a,b,t):t<2.?mix(b,c,t-1.):mix(c,d,t-2.);}
void main(){
 vec2 uv=(gl_FragCoord.xy-.5*uRes)/min(uRes.x,uRes.y)*2.78;
 float r=length(uv);if(r>1.38){gl_FragColor=vec4(0.);return;}
 float z=sqrt(max(0.,1.-r*r));vec3 n=normalize(vec3(uv,z+1e-4));
 float fres=pow(1.-z,2.2);
 float flow=noise(n.xy*1.5+uTime*.08)+.5*noise(n.yx*3.-uTime*.13);
 float bands=.5+.5*sin((flow*3.+z*6.-uTime*.6)*3.14159);
 float lit=.55+.45*max(0.,dot(n,normalize(vec3(-.35,.45,.8))));
 vec3 col=holo(flow*.32+fres*.7+uv.y*.12+uTime*.03)*(.22+.78*z)*lit;
 col=mix(col,holo(flow+.35+uTime*.05),bands*.16*z);
 col+=holo(fres+uTime*.05)*fres*1.3;
 col+=pow(max(0.,dot(n,normalize(vec3(-.4,.5,.75)))),24.)*.9;
 col+=vec3(.6,1.,.95)*pow(z,6.)*.22;
 col*=(.975+.025*sin(gl_FragCoord.y*1.2+uTime*3.))*(1.+uEnergy*.35*sin(uTime*6.+r*10.));
 float a=smoothstep(1.01,.985,r);float hl=smoothstep(1.38,1.,r)*(1.-a);hl*=hl;
 vec3 hc=holo(atan(uv.y,uv.x)*.159+uTime*.04)*hl*(.45+.4*uEnergy);
 gl_FragColor=vec4(col*a+hc,a+hl*.35);
}`;
 const sh=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);return gl.getShaderParameter(s,gl.COMPILE_STATUS)?s:null};
 const vs=sh(gl.VERTEX_SHADER,VS),fs=sh(gl.FRAGMENT_SHADER,FS);if(!vs||!fs){cv.remove();return}
 const pr=gl.createProgram();gl.attachShader(pr,vs);gl.attachShader(pr,fs);gl.linkProgram(pr);
 if(!gl.getProgramParameter(pr,gl.LINK_STATUS)){cv.remove();return}
 gl.useProgram(pr);
 const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
 const loc=gl.getAttribLocation(pr,'p');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
 const uRes=gl.getUniformLocation(pr,'uRes'),uTime=gl.getUniformLocation(pr,'uTime'),uEnergy=gl.getUniformLocation(pr,'uEnergy');
 gl.clearColor(0,0,0,0);
 let visible=true,energy=0,target=0,ready=false,dead=false,last=0;const t0=performance.now();
 function size(){
  const dpr=Math.min(1.75,window.devicePixelRatio||1),s=Math.max(1,orb.clientWidth);
  const px=Math.round(s*dpr);if(cv.width!==px){cv.width=px;cv.height=px}
  gl.viewport(0,0,cv.width,cv.height);gl.uniform2f(uRes,cv.width,cv.height);
 }
 function frame(now){
  if(dead)return;
  const t=reduceMQ.matches?3:((now-t0)/1000)%1000;
  energy+=(target-energy)*.06;
  gl.uniform1f(uTime,t);gl.uniform1f(uEnergy,energy);
  gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,3);
  if(!ready){ready=true;orb.classList.add('gl-on')}
 }
 function loop(now){if(now-last>=15){last=now;frame(now)}}
 const run=()=>{if(!dead&&visible&&!document.hidden&&!reduceMQ.matches)Tick.add(loop);else Tick.del(loop)};
 cv.addEventListener('webglcontextlost',e=>{e.preventDefault();dead=true;Tick.del(loop);orb.classList.remove('gl-on');cv.remove()});
 if('ResizeObserver' in window)new ResizeObserver(()=>{size();if(reduceMQ.matches)frame(performance.now())}).observe(orb);
 document.addEventListener('visibilitychange',run);
 if('IntersectionObserver' in window)new IntersectionObserver(es=>{visible=es[0].isIntersecting;run()}).observe(orb);
 if(reduceMQ.addEventListener)reduceMQ.addEventListener('change',()=>{run();frame(performance.now())});
 // The orb "leans in" when you reach for the primary action.
 const cta=document.querySelector('.hero-actions .button');
 if(cta){const on=()=>{target=1},off=()=>{target=0};
  cta.addEventListener('pointerenter',on);cta.addEventListener('pointerleave',off);cta.addEventListener('focus',on);cta.addEventListener('blur',off)}
 size();frame(performance.now());run();
})();

/* ---------- Orb parallax (pointer-fine, motion allowed). Rect cached on enter; CSS transition smooths it. ---------- */
(()=>{
 if(!fineMQ.matches||reduceMQ.matches)return;
 const hero=document.querySelector('.hero'),orb=document.getElementById('orb');if(!hero||!orb)return;
 let rect=null,raf=0,x=0,y=0;
 hero.addEventListener('pointerenter',()=>{rect=hero.getBoundingClientRect()},{passive:true});
 hero.addEventListener('pointermove',e=>{
  if(!rect)rect=hero.getBoundingClientRect();
  x=(e.clientX-rect.left)/rect.width-.5;y=(e.clientY-rect.top)/rect.height-.5;
  if(!raf)raf=requestAnimationFrame(()=>{raf=0;orb.style.setProperty('--px',(x*2).toFixed(3));orb.style.setProperty('--py',(y*2).toFixed(3))});
 },{passive:true});
 hero.addEventListener('pointerleave',()=>{rect=null;orb.style.setProperty('--px','0');orb.style.setProperty('--py','0')});
 window.addEventListener('scroll',()=>{rect=null},{passive:true});
})();

/* ---------- Scroll reveal: each section once, children staggered. Only hides when IO exists. ---------- */
(()=>{
 if(!('IntersectionObserver' in window))return;
 const sections=[...document.querySelectorAll('main > .section')];
 // .seen marks a section as reached (drives the connector light pulse); works with or without reduced motion.
 const seen=new IntersectionObserver(es=>{for(const e of es)if(e.isIntersecting){e.target.classList.add('seen');seen.unobserve(e.target)}},{threshold:.25});
 sections.forEach(s=>seen.observe(s));
 if(reduceMQ.matches)return;
 const sel=':scope > .section-head > *, :scope > .grid > *, :scope > .steps > *, :scope > .faq > *, :scope > .footnote, :scope > .trust-more';
 const groups=sections.map(s=>[...s.querySelectorAll(sel)]);
 const vh=window.innerHeight||800;
 const io=new IntersectionObserver(es=>{
  for(const e of es){
   if(!e.isIntersecting)continue;
   io.unobserve(e.target);
   (groups[sections.indexOf(e.target)]||[]).forEach((el,i)=>{el.style.setProperty('--rvd',Math.min(i,9)*55+'ms');el.classList.add('in')});
  }
 },{rootMargin:'0px 0px -12% 0px',threshold:0.06});
 sections.forEach((s,i)=>{
  if(s.getBoundingClientRect().top<vh*.9)return; // already on screen at load: never hide it
  for(const el of groups[i])el.classList.add('rv');
  io.observe(s);
 });
 document.documentElement.classList.add('rv-on');
 window.addEventListener('beforeprint',()=>document.documentElement.classList.remove('rv-on'));
 // Safety net: if IO callbacks stall (throttled tab, odd embeds), a throttled scroll check reveals what is on screen.
 let st=0;const pending=()=>sections.filter((s,i)=>groups[i].some(el=>el.classList.contains('rv')&&!el.classList.contains('in')));
 const check=()=>{st=0;const h=window.innerHeight||800;let left=0;
  for(const s of pending()){if(s.getBoundingClientRect().top<h*.95){io.unobserve(s);groups[sections.indexOf(s)].forEach(el=>el.classList.add('in'))}else left++}
  if(!left)window.removeEventListener('scroll',onScroll)};
 const onScroll=()=>{if(!st)st=setTimeout(check,250)};
 window.addEventListener('scroll',onScroll,{passive:true});
 // If someone jumps straight to a #hash, reveal everything immediately.
 window.addEventListener('hashchange',()=>{document.querySelectorAll('.rv').forEach(el=>el.classList.add('in'))});
})();

/* ---------- Active section indicator in the nav ---------- */
(()=>{
 if(!('IntersectionObserver' in window))return;
 const links=[...document.querySelectorAll('.nav-links a[href^="#"]')];if(!links.length)return;
 const byId=new Map(links.map(a=>[a.getAttribute('href').slice(1),a]));
 const set=id=>links.forEach(a=>{const on=a===byId.get(id);a.classList.toggle('is-on',on);on?a.setAttribute('aria-current','true'):a.removeAttribute('aria-current')});
 const io=new IntersectionObserver(es=>{for(const e of es)if(e.isIntersecting)set(e.target.id)},{rootMargin:'-45% 0px -50% 0px'});
 document.querySelectorAll('main > section[id]').forEach(s=>io.observe(s));
 const hero=document.querySelector('.hero');
 if(hero)new IntersectionObserver(es=>{if(es[0].isIntersecting)set('')},{rootMargin:'-45% 0px -50% 0px'}).observe(hero);
})();

/* ---------- Bento demos: play while a card sits in the middle band of the viewport (touch-friendly) ---------- */
(()=>{
 if(!('IntersectionObserver' in window)||reduceMQ.matches)return;
 const io=new IntersectionObserver(es=>{for(const e of es)e.target.classList.toggle('is-play',e.isIntersecting)},{rootMargin:'-30% 0px -30% 0px'});
 document.querySelectorAll('.feature').forEach(c=>io.observe(c));
})();

/* ---------- Holo tilt: one delegated listener, rAF-throttled, rect read only on enter/scroll. Max +-3deg. ---------- */
(()=>{
 if(!fineMQ.matches||reduceMQ.matches)return;
 let el=null,rect=null,raf=0,px=0,py=0;
 const reset=c=>{c.style.setProperty('--rx','0deg');c.style.setProperty('--ry','0deg')};
 addEventListener('pointerover',e=>{
  const t=e.target.closest&&e.target.closest('.h-tilt');
  if(t!==el){if(el)reset(el);el=t;rect=t?t.getBoundingClientRect():null}
 },{passive:true});
 addEventListener('pointermove',e=>{
  if(!el||e.pointerType==='touch')return;px=e.clientX;py=e.clientY;
  if(!raf)raf=requestAnimationFrame(()=>{
   raf=0;if(!el||!rect)return;
   const x=Math.min(1,Math.max(0,(px-rect.left)/rect.width)),y=Math.min(1,Math.max(0,(py-rect.top)/rect.height));
   const calm=el.matches(':focus-within')?.3:1;
   el.style.setProperty('--ry',((x-.5)*6*calm).toFixed(2)+'deg');el.style.setProperty('--rx',((.5-y)*6*calm).toFixed(2)+'deg');
   el.style.setProperty('--mx',(x*100).toFixed(1)+'%');el.style.setProperty('--my',(y*100).toFixed(1)+'%');
  });
 },{passive:true});
 addEventListener('scroll',()=>{if(el)rect=el.getBoundingClientRect()},{passive:true});
})();
