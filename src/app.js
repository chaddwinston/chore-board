import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signOut, reload } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, collection, query, where, onSnapshot, setDoc, deleteField } from 'firebase/firestore';
import FIREBASE_CONFIG from './firebase-config.js';
import STARTER from './starter.js';
(function(){
'use strict';
/* ---------- constants ---------- */
var DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
var DOW_LONG=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
var WHEN={am:'Morning',any:'Anytime',pm:'Evening'}, WO={am:0,any:1,pm:2};
var WHEN_ICON={am:'☀️',any:'🕒',pm:'🌙'};
var PALETTE=['#F08C00','#1C7ED6','#2F9E44','#D6336C','#7048E8','#0C8599','#E8590C','#5C940D'];
var EMOJI=['🐕','🍽️','🧽','🧺','🛏️','🚽','🧹','🪣','🏊','🧪','🌿','🍂','🗑️','🧊','🔥','🌀','🔋','💊','📝','🛒','🧴','🪟','✨','🔧'];
var ANY='#0C8599';
var LS='chore-board-local-v1', LS_ME='chore-board-me';
function getMe(){try{return localStorage.getItem(LS_ME)||''}catch(e){return ''}}
function setMe(v){try{localStorage.setItem(LS_ME,v)}catch(e){}}
var ICONS={
  today:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  week:'<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 4v16M13 4v16M18 4v16"/></svg>',
  month:'<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18M8 2v4M16 2v4M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01"/></svg>',
  upcoming:'<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/><path d="M12 7v5l3 2"/></svg>',
  points:'<svg viewBox="0 0 24 24"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"/></svg>',
  setup:'<svg viewBox="0 0 24 24"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
  full:'<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>'
};
var CHECK='<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

/* ---------- dates ---------- */
function pad(n){return (n<10?'0':'')+n}
function ymd(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
function parse(s){var a=s.split('-').map(Number);return new Date(a[0],a[1]-1,a[2])}
function addDays(s,n){var d=parse(s);d.setDate(d.getDate()+n);return ymd(d)}
function today(){return ymd(new Date())}
function diffDays(a,b){return Math.round((parse(a)-parse(b))/86400000)}
function weekStart(s){var k=(parse(s).getDay()+6)%7;return addDays(s,-k)}
function fmtLong(s){return parse(s).toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})}
function fmtShort(s){return parse(s).toLocaleDateString(undefined,{month:'short',day:'numeric'})}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function sleep(ms){return new Promise(function(r){setTimeout(r,ms)})}
function clone(o){return JSON.parse(JSON.stringify(o))}
function uid(p){return p+Date.now().toString(36)+Math.random().toString(36).slice(2,6)}

/* ---------- state ---------- */
var db=null, mode='connecting';
var config=null, nextMap={}, days={}, progress={};
var exists={next:false,day:{}};
var lastToday=today();
var ui={tab:'today',date:today(),weekOf:today(),monthOf:today().slice(0,7),modal:null};
try{var h=(location.hash||'').slice(1); if(['today','week','month','upcoming','points','setup'].indexOf(h)>=0) ui.tab=h;}catch(e){}

function people(){return (config&&config.people)||[]}
function tasks(){return (config&&config.tasks)||[]}
function settings(){return (config&&config.settings)||{screensaverMin:5}}
function personById(id){for(var i=0,p=people();i<p.length;i++) if(p[i].id===id) return p[i]; return null}
function colorOf(who){var p=personById(who);return p?p.color:ANY}
function nextOf(t){return nextMap[t.id]||today()}
function rec(date,id){var d=days[date];return d&&d.done?d.done[id]:null}
function isDone(date,id){return !!rec(date,id)}
function byWhen(a,b){return (WO[a.when]-WO[b.when])||((a.order||0)-(b.order||0))}

function tasksFor(date){
  var t=today(), dow=parse(date).getDay();
  return tasks().filter(function(k){
    if(k.type==='days') return (k.days||[]).indexOf(dow)>=0;
    if(date===t) return nextOf(k)<=t || isDone(date,k.id);
    if(date>t) return nextOf(k)===date;
    return isDone(date,k.id);
  }).sort(byWhen);
}
function plannedFor(date){return tasks().filter(function(k){return k.type==='days'&&(k.days||[]).indexOf(parse(date).getDay())>=0})}

/* ---------- persistence (Firebase) ---------- */
var fb=null, auth=null, fs=null, user=null, unsubs=[], REF={}, configFromServer=false;
var authUi={mode:'signin',busy:false,msg:''};
function configured(){return !!(FIREBASE_CONFIG&&FIREBASE_CONFIG.apiKey&&FIREBASE_CONFIG.projectId)}
function canWrite(){return (mode==='live'||mode==='offline')&&!!fs}
function writeErr(e){
  var c=e&&e.code;
  if(c==='permission-denied'){mode='denied';render();return}
  toast('Couldn’t save: '+((e&&e.message)||c||'unknown error'));
}
function saveConfig(){ if(!canWrite()) return; setDoc(REF.config,clone(config)).catch(writeErr); }
function setNext(id,date){
  nextMap=Object.assign({},nextMap);nextMap[id]=date;
  if(!canWrite()) return;
  var u={};u[id]=date;
  setDoc(REF.next,{next:u},{merge:true}).catch(writeErr);
}
function setDone(date,id,val){
  var prev=days[date]||{date:date,done:{}};
  var done=Object.assign({},prev.done||{});done[id]=val;
  days[date]={date:date,done:done};
  if(!canWrite()) return;
  var u={};u[id]=val;
  setDoc(doc(fs,'households','home','days',date),{date:date,done:u},{merge:true}).catch(writeErr);
}
function loadStarter(){
  var t=today(), next={};
  Object.keys(STARTER.nextIn).forEach(function(id){next[id]=addDays(t,STARTER.nextIn[id])});
  config=clone(STARTER.config); nextMap=next;
  setDoc(REF.config,clone(STARTER.config)).catch(writeErr);
  setDoc(REF.next,{next:next}).catch(writeErr);
  toast('Starter schedule loaded');
  render();
}
function boot(){
  if(!configured()){mode='unconfigured';render();return}
  fb=initializeApp(FIREBASE_CONFIG);
  auth=getAuth(fb);
  try{ fs=initializeFirestore(fb,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})}); }
  catch(e){ fs=initializeFirestore(fb,{}); }
  REF.config=doc(fs,'households','home');
  REF.next=doc(fs,'households','home','meta','next');
  REF.progress=doc(fs,'households','home','meta','progress');
  onAuthStateChanged(auth,function(u){
    user=u; stopListening();
    if(!u){mode='auth';render();return}
    if(!u.emailVerified){mode='verify';render();return}
    startListening();
  });
  addEventListener('offline',function(){if(mode==='live'){mode='offline';render()}});
}
function stopListening(){unsubs.forEach(function(f){try{f()}catch(e){}});unsubs=[];config=null;nextMap={};days={};progress={};configFromServer=false}
function startListening(){
  mode='connecting';render();
  var timer=setTimeout(function(){if(mode==='connecting'){mode='offline';render()}},10000);
  function ok(s){
    if(s.metadata.fromCache){ if(mode==='connecting'&&config) mode='offline'; }
    else { clearTimeout(timer); if(mode==='connecting'||mode==='offline') mode='live'; }
  }
  function bad(e){clearTimeout(timer); mode=(e&&e.code==='permission-denied')?'denied':'offline'; render();}
  var opts={includeMetadataChanges:true};
  unsubs.push(onSnapshot(REF.config,opts,function(s){
    if(!s.metadata.fromCache) configFromServer=true;
    config=s.exists()?clone(s.data()):null; ok(s); render();
  },bad));
  unsubs.push(onSnapshot(REF.progress,opts,function(s){
    progress=s.exists()?clone((s.data()||{}).p||{}):{}; ok(s); render();
  },bad));
  unsubs.push(onSnapshot(REF.next,opts,function(s){
    nextMap=s.exists()?Object.assign({},(s.data()||{}).next||{}):{}; ok(s); render();
  },bad));
  var q=query(collection(fs,'households','home','days'),where('date','>=',(function(){var c=addDays(today(),-120),y=today().slice(0,4)+'-01-01';return y<c?y:c})()));
  unsubs.push(onSnapshot(q,opts,function(qs){
    qs.docChanges().forEach(function(ch){if(ch.type==='removed') delete days[ch.doc.id]});
    qs.docs.forEach(function(d){days[d.id]=d.data()});
    ok(qs); render();
  },bad));
}
function authError(e){
  var c=(e&&e.code)||'';
  var m={'auth/invalid-credential':'Email or password is wrong.','auth/wrong-password':'Email or password is wrong.','auth/user-not-found':'No account with that email yet. Tap “Create account”.','auth/email-already-in-use':'That email already has an account. Sign in instead.','auth/weak-password':'Use at least 6 characters for the password.','auth/invalid-email':'That email address doesn’t look right.','auth/too-many-requests':'Too many tries. Wait a minute and try again.','auth/network-request-failed':'No connection. Check your signal and try again.'}[c];
  return m||((e&&e.message)||'Something went wrong.');
}
async function doAuth(form){
  var email=form.elements.email.value.trim(), pw=form.elements.password.value;
  if(!email||!pw) return;
  authUi.busy=true;authUi.msg='';render();
  try{
    if(authUi.mode==='signup'){
      var cred=await createUserWithEmailAndPassword(auth,email,pw);
      await sendEmailVerification(cred.user);
    }else{
      await signInWithEmailAndPassword(auth,email,pw);
    }
  }catch(e){authUi.msg=authError(e)}
  authUi.busy=false;render();
}
async function doForgot(){
  var el=document.querySelector('input[name="email"]'), email=el?el.value.trim():'';
  if(!email){authUi.msg='Type your email above first, then tap “Forgot password”.';render();return}
  try{await sendPasswordResetEmail(auth,email);authUi.msg='Password reset email sent to '+email+'.'}catch(e){authUi.msg=authError(e)}
  render();
}
async function doContinue(){
  if(!user) return;
  try{
    await reload(user);
    if(auth.currentUser&&auth.currentUser.emailVerified){
      await auth.currentUser.getIdToken(true);
      user=auth.currentUser; stopListening(); startListening();
    }else{authUi.msg='Not verified yet. Tap the link in the email, then try again.';render()}
  }catch(e){authUi.msg=authError(e);render()}
}
async function doResend(){try{await sendEmailVerification(user);authUi.msg='Sent again. Check your inbox (and spam).'}catch(e){authUi.msg=authError(e)}render()}
function doSignOut(){stopListening();signOut(auth)}
function vAuth(){
  var h='<div class="authwrap"><div class="authcard"><div class="logo big">✓</div><h1>Chore Board</h1>';
  if(mode==='unconfigured'){
    h+='<p>This copy of the app isn’t connected to its database yet. Add the Firebase web settings to <b>src/firebase-config.js</b> and rebuild.</p>';
  }else if(mode==='verify'){
    h+='<p>We sent a verification link to <b>'+esc(user&&user.email)+'</b>. Tap it, then come back here and tap Continue.</p>'+
      '<button class="btn primary wide" data-action="continue">Continue</button><div class="authlinks"><button data-action="resend">Resend email</button><button data-action="signout">Sign out</button></div>';
  }else if(mode==='denied'){
    h+='<p><b>'+esc(user&&user.email)+'</b> isn’t on this household’s list, so the board won’t open for it.</p><p class="muted">Ask whoever set up the board to add this email in Firebase → Firestore → Rules.</p><button class="btn wide" data-action="signout">Sign out</button>';
  }else{
    var up=authUi.mode==='signup';
    h+='<form data-form="auth"><div class="f"><label>Email</label><input name="email" type="email" autocomplete="username" required></div>'+
      '<div class="f"><label>Password</label><input name="password" type="password" autocomplete="'+(up?'new-password':'current-password')+'" minlength="6" required></div>'+
      '<button class="btn primary wide" type="submit"'+(authUi.busy?' disabled':'')+'>'+(authUi.busy?'One sec…':(up?'Create account':'Sign in'))+'</button></form>'+
      '<div class="authlinks"><button data-action="authmode">'+(up?'I already have an account':'Create account')+'</button>'+(up?'':'<button data-action="forgot">Forgot password</button>')+'</div>';
  }
  if(authUi.msg) h+='<p class="authmsg">'+esc(authUi.msg)+'</p>';
  return h+'</div></div>';
}

/* ---------- actions ---------- */
function toggle(date,id,el,force){
  if(!canWrite()){toast(mode==='readonly'?'View only.':'Still connecting…');return}
  var t=null;tasks().forEach(function(k){if(k.id===id)t=k});
  if(!t) return;
  if(!force&&hasSteps(t)){openSteps(date,id);return}
  if(date>today()) return;
  var r=rec(date,id);
  if(r){
    setDone(date,id,null);
    if(t.type==='interval'&&r.prev) setNext(id,r.prev);
  }else{
    if(!personById(t.who)&&people().length>1&&!personById(getMe())) toast('Tip: pick “This device is” at the top so you get credit.');
    var v={at:Date.now(),pts:ptsOf(t),by:personById(t.who)?t.who:(personById(getMe())?getMe():'any')};
    if(t.type==='interval'){v.prev=nextOf(t);setNext(id,addDays(date,t.every||7))}
    setDone(date,id,v);
    if(el) burst(el,colorOf(t.who));
    // all done for this person (or whole day if single)?
    var list=tasksFor(date), mine=people().length>1?list.filter(function(k){return (k.who||'any')===(t.who||'any')}):list;
    if(mine.length&&mine.every(function(k){return isDone(date,k.id)})){
      var p=personById(t.who);
      setTimeout(function(){confetti();toast((people().length>1&&p?p.name+' finished':'All done')+' for '+(date===today()?'today':fmtShort(date))+'! ⭐')},250);
    }
  }
  render();
}

/* ---------- steps (mini tasks) ---------- */
function taskById(id){var t=null;tasks().forEach(function(k){if(k.id===id)t=k});return t}
function hasSteps(k){return !!(k&&k.steps&&k.steps.length)}
function stepKey(k,date){return k.type==='interval'?'due'+nextOf(k):'d'+date}
function stepRec(k,date,sid){ if(isDone(date,k.id)) return rec(date,k.id); var e=(progress[k.id]||{})[stepKey(k,date)]; return e?e[sid]:null }
function stepsDoneCount(k,date){ if(isDone(date,k.id)) return k.steps.length; return k.steps.filter(function(st){return !!stepRec(k,date,st.id)}).length }
function setStep(k,date,sid,val){
  var key=stepKey(k,date), cur=progress[k.id]||{}, upd={}, entry={};
  entry[sid]=val; upd[key]=entry;
  Object.keys(cur).forEach(function(kk){ if(kk!==key) upd[kk]=deleteField(); });
  var np=Object.assign({},progress), nt={}; nt[key]=Object.assign({},cur[key]||{}); nt[key][sid]=val; np[k.id]=nt; progress=np;
  if(canWrite()){var body={p:{}};body.p[k.id]=upd;setDoc(REF.progress,body,{merge:true}).catch(writeErr)}
}
function stepToggle(sid){
  var m=ui.modal; if(!m||m.kind!=='steps') return;
  var k=taskById(m.id); if(!k) return;
  if(!canWrite()){toast('View only.');return}
  if(m.date>today()){toast('You can check steps off on the day.');return}
  var idx=-1; k.steps.forEach(function(st,i){if(st.id===sid)idx=i});
  var wasDone=isDone(m.date,k.id), cur=stepRec(k,m.date,sid);
  if(cur){
    if(wasDone){ // reopen: keep the other steps checked, uncheck this one
      var r=rec(m.date,k.id), by=(r&&r.by)||'any', at=(r&&r.at)||Date.now();
      toggle(m.date,k.id,null,true);
      k.steps.forEach(function(st){ if(st.id!==sid) setStep(k,m.date,st.id,{at:at,by:by}); });
      setStep(k,m.date,sid,null);
    } else setStep(k,m.date,sid,null);
  }else{
    if(k.stepsInOrder){ for(var i=0;i<idx;i++){ if(!stepRec(k,m.date,k.steps[i].id)){ toast('Do the steps in order. Next up: \u201C'+k.steps[i].name+'\u201D'); return; } } }
    var me=personById(k.who)?k.who:(personById(getMe())?getMe():'any');
    setStep(k,m.date,sid,{at:Date.now(),by:me});
    var row=modalEl.querySelector('[data-sid="'+sid+'"] .check'); if(row) burst(row,colorOf(k.who));
    if(stepsDoneCount(k,m.date)===k.steps.length&&!isDone(m.date,k.id)){
      toggle(m.date,k.id,null,true);
      toast(k.name+': done! +'+ptsLabel(ptsOf(k)));
      setTimeout(function(){ if(ui.modal&&ui.modal.kind==='steps'&&ui.modal.id===k.id) closeModal(); },900);
    }
  }
  renderSteps(); render();
}
function openSteps(date,id){ ui.modal={kind:'steps',date:date,id:id}; renderSteps(); }
function renderSteps(){
  var m=ui.modal; if(!m||m.kind!=='steps') return;
  var k=taskById(m.id); if(!k||!hasSteps(k)){closeModal();return}
  var done=isDone(m.date,k.id), n=stepsDoneCount(k,m.date), N=k.steps.length, future=m.date>today(), c=colorOf(k.who);
  var nextIdx=-1; if(k.stepsInOrder&&!done){ for(var i=0;i<N;i++){ if(!stepRec(k,m.date,k.steps[i].id)){nextIdx=i;break} } }
  var h='<div class="scrim" data-action="scrim"><div class="sheet ssheet" style="--c:'+c+'"><div class="phead"><span class="sico">'+esc(k.icon||'')+'</span><div><h2>'+esc(k.name)+'</h2><span class="muted">'+(m.date===today()?'Today':esc(fmtLong(m.date)))+' \u00B7 '+n+' of '+N+' steps \u00B7 \u2B50 '+ptsLabel(ptsOf(k))+'</span></div><button class="btn sm" data-action="close" style="margin-left:auto">Close</button></div>'+
    '<div class="prog big"><i style="width:'+Math.round(n/N*100)+'%;background:'+c+'"></i></div>'+
    (k.stepsInOrder?'<p class="muted small">Do these in order.</p>':'')+(future?'<p class="muted small">Preview: you can check steps off on the day.</p>':'')+'<div class="steps">';
  k.steps.forEach(function(st,i){
    var r=stepRec(k,m.date,st.id), who=r&&people().length>1?personById(r.by):null, locked=k.stepsInOrder&&!r&&nextIdx>=0&&i>nextIdx;
    h+='<button class="step'+(r?' done':'')+(locked||future?' locked':'')+'" data-action="step" data-sid="'+esc(st.id)+'"><span class="num">'+(i+1)+'</span><span class="sname">'+esc(st.name)+(who?'<small style="color:'+who.color+'">\u2713 '+esc(who.name)+'</small>':'')+'</span><span class="check">'+CHECK+'</span></button>';
  });
  h+='</div>'+(done?'<p class="donebar">\u2713 Chore complete</p>':'<p class="muted small">The chore checks itself off when the last step is done.</p>')+(k.notes?'<p class="muted small">'+esc(k.notes)+'</p>':'')+'</div></div>';
  modalEl.innerHTML=h;
}

/* ---------- render ---------- */
var root=document.getElementById('root');
function render(){
  if(['auth','verify','denied','unconfigured'].indexOf(mode)>=0){root.innerHTML=vAuth();return}
  var t=today();
  var h='<div class="shell"><nav class="rail"><div class="logo">✓</div>'+
    navBtn('today','Today')+navBtn('week','Week')+navBtn('month','Month')+navBtn('upcoming','Upcoming')+navBtn('points','Points')+navBtn('setup','Setup')+
    '<div class="spacer"></div><button class="nav" data-action="full">'+ICONS.full+'Wall</button></nav><main class="main">';
  h+='<div class="top"><div><div class="clock" data-clock></div></div><div class="dateline">'+esc(fmtLong(t))+'<small>'+esc(subline())+'</small></div><div class="grow"></div>'+statusPill()+'</div>';
  if(mode==='offline') h+='<div class="banner">You’re offline. Check-offs are saved on this device and sync when you’re back online.</div>';
  if(mode==='connecting'&&!config) h+='<div class="empty">Loading your board…</div>';
  else if(!config&&configFromServer) h+='<div class="card"><h3>Your board is empty</h3><p>Load the starter schedule (43 chores for the house, pool, yard and dogs), then adjust it in Setup.</p><button class="btn primary" data-action="starter">Load starter schedule</button> <button class="btn" data-action="tab" data-tab="setup">Start from scratch</button></div>';
  else if(!config&&ui.tab!=='setup') h+='<div class="empty">Loading your board…</div>';
  else if(!tasks().length&&ui.tab!=='setup') h+='<div class="card"><h3>No chores yet</h3><p>Open Setup to add people and chores.</p><button class="btn primary" data-action="tab" data-tab="setup">Go to Setup</button></div>';
  else h+=({today:vToday,week:vWeek,month:vMonth,upcoming:vUpcoming,points:vPoints,setup:vSetup}[ui.tab]||vToday)();
  h+='</main></div>';
  var sy=window.scrollY, colsScroll=[];
  document.querySelectorAll('.cols').forEach(function(c){colsScroll.push(c.scrollLeft)});
  root.innerHTML=h;
  document.querySelectorAll('.cols').forEach(function(c,i){if(colsScroll[i])c.scrollLeft=colsScroll[i]});
  window.scrollTo(0,sy);
  tickClock();
  if(ui.modal&&ui.modal.kind==='steps') renderSteps();
}
function navBtn(k,label){return '<button class="nav'+(ui.tab===k?' on':'')+'" data-action="tab" data-tab="'+k+'">'+ICONS[k]+label+'</button>'}
function subline(){
  var t=today(), list=tasksFor(t), left=list.filter(function(k){return !isDone(t,k.id)});
  if(!list.length) return 'Nothing scheduled today';
  if(!left.length) return 'Everything’s done today ⭐';
  var m=left.reduce(function(s,k){return s+(+k.mins||0)},0);
  return left.length+' chore'+(left.length>1?'s':'')+' left · about '+m+' min';
}
function statusPill(){
  var m=({connecting:['','Connecting…'],live:['live','Synced'],offline:['warn','Offline: will sync']})[mode]||['',''];
  return '<span class="pill '+m[0]+'"><i></i>'+m[1]+'</span>';
}
function ring(pct,color,label){
  var c=2*Math.PI*23, off=c*(1-pct);
  return '<div class="ring"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="23" fill="none" stroke="var(--line)" stroke-width="5"/><circle cx="26" cy="26" r="23" fill="none" stroke="'+color+'" stroke-width="5" stroke-linecap="round" stroke-dasharray="'+c.toFixed(1)+'" stroke-dashoffset="'+off.toFixed(1)+'"/></svg><div class="av" style="background:'+color+'">'+esc(label)+'</div></div>';
}
function ptsOf(k){return (k&&k.points!=null&&k.points!=='')?Math.max(0,+k.points||0):Math.max(1,Math.round((+(k&&k.mins)||0)/5))}
function recPts(r,id){ if(!r) return 0; if(r.pts!=null) return +r.pts||0; var t=null; tasks().forEach(function(k){if(k.id===id)t=k}); return t?ptsOf(t):0; }
function pointsBetween(from,to){
  var out={};
  for(var d in days){ if(d<from||d>to) continue; var dd=days[d]; if(!dd||!dd.done) continue;
    for(var id in dd.done){ var r=dd.done[id]; if(!r) continue; var who=personById(r.by)?r.by:'any'; out[who]=(out[who]||0)+recPts(r,id); } }
  return out;
}
function starsThisWeek(pid){ return pointsBetween(weekStart(today()),today())[pid]||0; }
function ptsLabel(n){return n+' pt'+(n===1?'':'s')}
function choreCard(k,date,opts){
  var t=today(), done=isDone(date,k.id), preview=date>t, badge='';
  if(k.type==='interval'&&date===t&&!done){var n=diffDays(t,nextOf(k)); if(n>0) badge='<span class="badge over">'+n+' day'+(n>1?'s':'')+' late</span>'; else badge='<span class="badge due">due</span>';}
  var r0=rec(date,k.id), byP=r0&&people().length>1&&!personById(k.who)?personById(r0.by):null;
  var meta=(byP?'<b style="color:'+byP.color+'">✓ '+esc(byP.name)+'</b> · ':'')+(opts&&opts.showWhen?WHEN_ICON[k.when]+' ':'')+(k.mins?k.mins+' min · ':'')+'⭐ '+ptsLabel(done&&r0&&r0.pts!=null?+r0.pts:ptsOf(k))+(k.type==='interval'?' · every '+k.every+' days':'')+badge;
  var stepBar=''; if(hasSteps(k)){var sn=stepsDoneCount(k,date), sN=k.steps.length; meta+=' · \u2611 '+sn+'/'+sN+' steps'; stepBar='<span class="sbar"><i style="width:'+Math.round(sn/sN*100)+'%"></i></span>';}
  return '<button class="chore'+(done?' done':'')+(preview?' preview':'')+'" style="--c:'+colorOf(k.who)+'" data-action="toggle" data-id="'+esc(k.id)+'" data-date="'+date+'">'+
    '<span class="ico">'+esc(k.icon||'✔️')+'</span><span class="body"><span class="name">'+esc(k.name)+'</span><span class="meta">'+meta+'</span>'+stepBar+(k.notes?'<span class="note">'+esc(k.notes)+'</span>':'')+'</span><span class="check">'+CHECK+'</span></button>';
}
function vToday(){
  var date=ui.date, t=today(), list=tasksFor(date), ppl=people();
  var h='<div class="top" style="margin-top:-4px"><div class="daynav"><button class="arrow" data-action="day" data-n="-1">‹</button><button class="btn" data-action="gotoday">'+(date===t?'Today':esc(fmtLong(date)))+'</button><button class="arrow" data-action="day" data-n="1">›</button></div>'+(date!==t?'<span class="pill">'+(date>t?'Preview: plan ahead':'Past day: you can still check things off')+'</span>':'')+'</div>';
  // people strip
  h+='<div class="strip">';
  var groups=ppl.length?ppl.map(function(p){return {p:p,items:list.filter(function(k){return k.who===p.id})}}):[];
  var anyItems=list.filter(function(k){return !personById(k.who)});
  if(anyItems.length) groups.push({p:{id:'any',name:'Anyone',color:ANY},items:anyItems});
  groups.forEach(function(g){
    var d=g.items.filter(function(k){return isDone(date,k.id)}).length, n=g.items.length;
    var did=g.p.id==='any'?0:list.filter(function(k){var r=rec(date,k.id);return r&&r.by===g.p.id}).length;
    var txt=g.p.id==='any'?d+' of '+n+' done':(n?d+' of '+n+' assigned · ':'')+did+' done '+(date===t?'today':'this day')+' · ⭐ '+starsThisWeek(g.p.id)+' pts this week';
    var pct=g.p.id==='any'||n?(n?d/n:0):(list.length?did/list.length:0);
    h+='<button class="who tap" data-action="person" data-pid="'+esc(g.p.id)+'" data-r="week" title="See '+esc(g.p.name)+'\u2019s chores and history">'+ring(pct,g.p.color,(g.p.name||'?').charAt(0).toUpperCase())+'<div><b>'+esc(g.p.name)+' <em class="chev">\u203A</em></b><span>'+txt+'</span></div></button>';
  });
  if(people().length>1){var me=getMe();h+='<label class="who" style="padding:10px 16px"><span>This device is</span><select data-change="me" style="border:1px solid var(--line);border-radius:10px;padding:6px 8px;background:var(--panel2);font-weight:800"><option value="">Choose\u2026</option>'+people().map(function(p){return '<option value="'+esc(p.id)+'"'+(me===p.id?' selected':'')+'>'+esc(p.name)+'</option>'}).join('')+'</select></label>'}
  h+='</div>';
  // columns
  var filled=groups.filter(function(g){return g.items.length}), cols, multi=filled.length>1;
  if(!multi){
    var color=filled[0]?filled[0].p.color:ANY;
    cols=['am','any','pm'].map(function(w){return {title:WHEN_ICON[w]+' '+WHEN[w],color:color,dot:'',items:list.filter(function(k){return k.when===w}),showWhen:false}});
  }else{
    cols=filled.map(function(g){return {title:g.p.name,color:g.p.color,dot:(g.p.name||'?').charAt(0).toUpperCase(),items:g.items,showWhen:true}});
  }
  h+='<div class="cols">';
  cols.forEach(function(c){
    var left=c.items.filter(function(k){return !isDone(date,k.id)}), mins=left.reduce(function(s,k){return s+(+k.mins||0)},0);
    h+='<section class="col" style="--c:'+c.color+'"><div class="col-h">'+(c.dot?'<span class="dot">'+esc(c.dot)+'</span>':'')+'<b>'+esc(c.title)+'</b><span>'+(c.items.length?(left.length?left.length+' left · '+mins+' min':'All done ⭐'):'')+'</span></div><div class="col-b">';
    if(!c.items.length) h+='<div class="empty">Nothing here</div>';
    c.items.forEach(function(k){h+=choreCard(k,date,{showWhen:c.showWhen})});
    h+='</div></section>';
  });
  h+='</div>';
  return h;
}
function vWeek(){
  var s=weekStart(ui.weekOf), t=today();
  var h='<div class="top" style="margin-top:-4px"><div class="daynav"><button class="arrow" data-action="week" data-n="-7">‹</button><button class="btn" data-action="thisweek">Week of '+esc(fmtShort(s))+'</button><button class="arrow" data-action="week" data-n="7">›</button></div></div>';
  // balance chart (planned load by weekday)
  var mins=[1,2,3,4,5,6,0].map(function(dw){return tasks().filter(function(k){return k.type==='days'&&(k.days||[]).indexOf(dw)>=0}).reduce(function(a,k){return a+(+k.mins||0)},0)});
  var mx=Math.max.apply(null,mins.concat([1]));
  h+='<div class="balance"><h3>Planned minutes per day (weekly chores)</h3><div class="bars">';
  mins.forEach(function(m,i){h+='<div class="bar"><span>'+m+'</span><i style="height:'+Math.max(4,Math.round(m/mx*80))+'px"></i>'+DOW[[1,2,3,4,5,6,0][i]]+'</div>'});
  h+='</div></div><div class="week">';
  for(var i=0;i<7;i++){
    var d=addDays(s,i), list=tasksFor(d), dn=list.filter(function(k){return isDone(d,k.id)}).length, m=list.reduce(function(a,k){return a+(+k.mins||0)},0);
    h+='<div class="wd'+(d===t?' today':'')+'"><button class="wd-h" data-action="openday" data-date="'+d+'"><b>'+DOW[parse(d).getDay()]+' '+parse(d).getDate()+'</b><span>'+list.length+' chores · '+m+' min</span>'+(d<=t&&list.length?'<div class="prog"><i style="width:'+Math.round(dn/list.length*100)+'%"></i></div>':'')+'</button><div class="wd-b">';
    list.forEach(function(k){var done=isDone(d,k.id);h+='<button class="chip'+(done?' done':'')+(d>t?' preview':'')+'" style="--c:'+colorOf(k.who)+'" data-action="toggle" data-id="'+esc(k.id)+'" data-date="'+d+'">'+esc(k.icon||'')+' '+esc(k.name)+'</button>'});
    h+='</div></div>';
  }
  return h+'</div>';
}
function vMonth(){
  var ym=ui.monthOf, first=ym+'-01', t=today();
  var label=parse(first).toLocaleDateString(undefined,{month:'long',year:'numeric'});
  var h='<div class="top" style="margin-top:-4px"><div class="daynav"><button class="arrow" data-action="month" data-n="-1">‹</button><button class="btn" data-action="thismonth">'+esc(label)+'</button><button class="arrow" data-action="month" data-n="1">›</button></div></div>';
  h+='<div class="mhead">'+[1,2,3,4,5,6,0].map(function(i){return '<div>'+DOW[i]+'</div>'}).join('')+'</div><div class="month">';
  var start=weekStart(first), d=start;
  for(var i=0;i<42;i++){
    if(i===35&&d.slice(0,7)!==ym) break;
    var list=tasksFor(d), out=d.slice(0,7)!==ym, extra='';
    if(d<=t&&list.length){var dn=list.filter(function(k){return isDone(d,k.id)}).length; extra='<small>'+dn+'/'+list.length+' done</small>'+(dn===list.length?'':'')+'<div class="prog"><i style="width:'+Math.round(dn/list.length*100)+'%"></i></div>';}
    else if(list.length) extra='<small>'+list.length+' chores</small>';
    var ints=list.filter(function(k){return k.type==='interval'}).map(function(k){return esc(k.icon||'•')}).slice(0,5).join('');
    var full=d<=t&&list.length&&list.every(function(k){return isDone(d,k.id)});
    h+='<button class="mc'+(out?' out':'')+(d===t?' today':'')+'" data-action="openday" data-date="'+d+'"><span class="n">'+parse(d).getDate()+(full?'<em>⭐</em>':'')+'</span><span class="ics">'+ints+'</span>'+extra+'</button>';
    d=addDays(d,1);
  }
  return h+'</div>';
}
function vUpcoming(){
  var t=today(), list=tasks().filter(function(k){return k.type==='interval'}).sort(function(a,b){return nextOf(a)<nextOf(b)?-1:nextOf(a)>nextOf(b)?1:0});
  var h='<div class="card"><h3>Repeating chores (every few weeks or months)</h3>';
  if(!list.length) h+='<div class="empty">None yet. Add one in Setup with “every N days.”</div>';
  list.forEach(function(k){
    var n=diffDays(nextOf(k),t), doneToday=isDone(t,k.id);
    var when=doneToday?'Done today · next '+fmtShort(nextOf(k)):n<0?'<span class="badge over">'+(-n)+' day'+(n<-1?'s':'')+' late</span>':n===0?'<span class="badge due">due today</span>':'in '+n+' day'+(n>1?'s':'')+' · '+fmtShort(nextOf(k));
    h+='<div class="row"><span class="ico">'+esc(k.icon||'')+'</span><span class="w" style="background:'+colorOf(k.who)+'"></span><span class="t"><b>'+esc(k.name)+'</b><span>'+when+' · every '+k.every+' days</span></span><button class="btn sm" data-action="toggle" data-id="'+esc(k.id)+'" data-date="'+t+'">'+(doneToday?'Undo':'Done')+'</button></div>';
  });
  return h+'</div>';
}
function vPoints(){
  var t=today(), ppl=people();
  function rowsFor(tot){var r=ppl.map(function(x){return {id:x.id,n:x.name,c:x.color,v:tot[x.id]||0}}); if(tot.any) r.push({id:'any',n:'Unassigned',c:ANY,v:tot.any}); return r}
  var periods=[['This week',weekStart(t),'week'],['This month',t.slice(0,7)+'-01','month'],['This year',t.slice(0,4)+'-01-01','year']];
  var h='<div class="ptsgrid">';
  periods.forEach(function(pd){
    var rows=rowsFor(pointsBetween(pd[1],t)), mx=Math.max.apply(null,rows.map(function(r){return r.v}).concat([1]));
    var top=Math.max.apply(null,rows.filter(function(r){return r.n!=='Unassigned'}).map(function(r){return r.v}).concat([0]));
    var leaders=rows.filter(function(r){return r.n!=='Unassigned'&&r.v===top&&top>0});
    h+='<div class="card"><h3>'+pd[0]+'</h3>'+rows.map(function(r){return '<button class="pt-row tap" data-action="person" data-pid="'+esc(r.id)+'" data-r="'+pd[2]+'"><span class="pt-name"><i style="background:'+r.c+'"></i>'+esc(r.n)+(leaders.length===1&&leaders[0]===r?' 👑':'')+'</span><span class="pt-bar"><i style="width:'+Math.round(r.v/mx*100)+'%;background:'+r.c+'"></i></span><b>'+r.v+'</b></button>'}).join('')+'</div>';
  });
  h+='</div>';
  function chart(title,buckets){
    var all=buckets.map(function(b){return rowsFor(pointsBetween(b.from,b.to))});
    var mx=1; all.forEach(function(rs){rs.forEach(function(r){if(r.v>mx)mx=r.v})});
    var c='<div class="card"><h3>'+title+'</h3><div class="hist">';
    buckets.forEach(function(b,i){c+='<div class="hcol"><div class="hbars">'+all[i].map(function(r){return '<i title="'+esc(r.n)+': '+r.v+'" style="height:'+Math.max(r.v?3:0,Math.round(r.v/mx*120))+'px;background:'+r.c+'"></i>'}).join('')+'</div><span>'+esc(b.label)+'</span></div>'});
    c+='</div><div class="legend">'+rowsFor({}).concat(all.some(function(rs){return rs.some(function(r){return r.n==='Unassigned'})})?[{n:'Unassigned',c:ANY}]:[]).map(function(r){return '<span><i style="background:'+r.c+'"></i>'+esc(r.n)+'</span>'}).join('')+'</div></div>';
    return c;
  }
  var weeks=[], ws=weekStart(t);
  for(var i=11;i>=0;i--){var f=addDays(ws,-7*i); weeks.push({from:f,to:addDays(f,6),label:(parse(f).getMonth()+1)+'/'+parse(f).getDate()})}
  var months=[], y=t.slice(0,4);
  for(var m=1;m<=+t.slice(5,7);m++){var mm=y+'-'+pad(m); months.push({from:mm+'-01',to:mm+'-31',label:parse(mm+'-01').toLocaleDateString(undefined,{month:'short'})})}
  h+=chart('Last 12 weeks',weeks)+chart(y+' by month',months);
  h+='<div class="card"><h3>How points work</h3><p class="muted" style="margin:0;line-height:1.5">Each chore is worth the points set on it (it starts at 1 point per 5 minutes). Points go to whoever checks the chore off: the assigned person, or for \u201CAnyone\u201D chores, the person picked under \u201CThis device is\u201D on that phone. Change a chore\u2019s points in Setup. Past check-offs keep the points they earned. Weeks run Monday to Sunday.</p></div>';
  return h;
}
function schedText(k){
  if(k.type==='interval') return 'Every '+k.every+' days · next '+fmtShort(nextOf(k));
  var d=k.days||[]; if(d.length===7) return 'Every day · '+WHEN[k.when];
  return [1,2,3,4,5,6,0].filter(function(x){return d.indexOf(x)>=0}).map(function(x){return DOW[x]}).join(' · ')+' · '+WHEN[k.when];
}
function vSetup(){
  var ppl=people(), all=tasks().slice().sort(byWhen);
  var daily=all.filter(function(k){return k.type==='days'&&(k.days||[]).length===7});
  var weekly=all.filter(function(k){return k.type==='days'&&(k.days||[]).length<7}).sort(function(a,b){var fa=((a.days[0]+6)%7),fb=((b.days[0]+6)%7);return fa-fb||byWhen(a,b)});
  var intv=all.filter(function(k){return k.type==='interval'}).sort(function(a,b){return a.every-b.every});
  function rows(list){return list.map(function(k){var p=personById(k.who);return '<button class="row" data-action="edit" data-id="'+esc(k.id)+'"><span class="ico">'+esc(k.icon||'')+'</span><span class="w" style="background:'+colorOf(k.who)+'"></span><span class="t"><b>'+esc(k.name)+'</b><span>'+esc(schedText(k))+' · '+(k.mins||0)+' min · ⭐ '+ptsLabel(ptsOf(k))+(hasSteps(k)?' · \u2611 '+k.steps.length+' steps':'')+' · '+esc(p?p.name:'Anyone')+'</span></span></button>'}).join('')||'<div class="empty">None</div>'}
  var ro=!canWrite();
  var h='<div class="grid2"><div>';
  h+='<div class="card"><div class="h2"><h3>People</h3>'+(ro?'':'<button class="btn sm primary" data-action="addperson">+ Person</button>')+'</div>';
  ppl.forEach(function(p){h+='<button class="row" data-action="editperson" data-id="'+esc(p.id)+'"><span class="w" style="background:'+p.color+';width:22px;height:22px"></span><span class="t"><b>'+esc(p.name)+'</b><span>'+tasks().filter(function(k){return k.who===p.id}).length+' chores assigned</span></span></button>'});
  if(!ppl.length) h+='<div class="empty">Add the people who share chores. Each gets a color and a column.</div>';
  h+='</div><div class="card"><h3>Display</h3><div class="f"><label>Screensaver clock after</label><select data-change="saver"'+(ro?' disabled':'')+'>'+[0,2,5,10,30].map(function(m){return '<option value="'+m+'"'+(+settings().screensaverMin===m?' selected':'')+'>'+(m?m+' minutes idle':'Off')+'</option>'}).join('')+'</select></div><button class="btn" data-action="full">'+'⛶ Full screen (wall mode)</button><p style="margin:14px 0 0;color:var(--muted);font-size:14px">Signed in as <b>'+esc(user&&user.email)+'</b></p><button class="btn sm" style="margin-top:8px" data-action="signout">Sign out</button></div>';
  h+='</div><div><div class="card"><div class="h2"><h3>Chores</h3>'+(ro?'':'<button class="btn sm primary" data-action="add">+ Chore</button>')+'</div>';
  h+='<h3 style="margin-top:10px;color:var(--muted);font-size:13px">EVERY DAY</h3>'+rows(daily);
  h+='<h3 style="margin-top:14px;color:var(--muted);font-size:13px">WEEKLY</h3>'+rows(weekly);
  h+='<h3 style="margin-top:14px;color:var(--muted);font-size:13px">EVERY FEW WEEKS / MONTHS</h3>'+rows(intv);
  return h+'</div></div></div>';
}

/* ---------- modals ---------- */
var modalEl=document.getElementById('modal');
function closeModal(){ui.modal=null;modalEl.innerHTML='';render()}
function openTask(id){
  if(!canWrite()){toast('View only.');return}
  var k=null;tasks().forEach(function(x){if(x.id===id)k=x});
  var isNew=!k; k=k?clone(k):{icon:'✨',name:'',who:(people()[0]||{}).id||'any',when:'any',mins:10,type:'days',days:[ (parse(ui.date).getDay()) ],every:30,notes:''};
  ui.modal={kind:'task',id:isNew?null:k.id,type:k.type,days:(k.days||[]).slice(),icon:k.icon,steps:clone(k.steps||[])};
  var ppl=people();
  var h='<div class="scrim" data-action="scrim"><form class="sheet" data-form="task"><h2>'+(isNew?'New chore':'Edit chore')+'</h2>'+
  '<div class="f"><label>Name</label><input name="name" required maxlength="80" value="'+esc(k.name)+'" placeholder="e.g. Water the plants"></div>'+
  '<div class="f"><label>Icon</label><div class="emojis">'+EMOJI.map(function(e){return '<button type="button" data-action="emoji" data-e="'+e+'"'+(e===k.icon?' style="outline:3px solid var(--accent)"':'')+'>'+e+'</button>'}).join('')+'</div></div>'+
  '<div class="fr"><div class="f"><label>Who</label><select name="who">'+ppl.map(function(p){return '<option value="'+esc(p.id)+'"'+(k.who===p.id?' selected':'')+'>'+esc(p.name)+'</option>'}).join('')+'<option value="any"'+(!personById(k.who)?' selected':'')+'>Anyone</option></select></div>'+
  '<div class="f"><label>Time of day</label><select name="when">'+['am','any','pm'].map(function(w){return '<option value="'+w+'"'+(k.when===w?' selected':'')+'>'+WHEN[w]+'</option>'}).join('')+'</select></div>'+
  '<div class="f"><label>Minutes</label><input name="mins" type="number" min="0" max="600" value="'+(+k.mins||0)+'"></div></div>'+
  '<div class="f"><label>Points</label><input name="points" type="number" min="0" max="999" inputmode="numeric" data-auto="'+(k.points==null?'1':'0')+'" value="'+ptsOf(k)+'"><small class="hint">Starts at 1 point per 5 minutes. Set it higher for chores nobody wants.</small></div>'+
  '<div class="f"><label>Repeats</label><div class="seg" data-seg="type"><button type="button" data-action="stype" data-v="days" class="'+(k.type==='days'?'on':'')+'">On set days</button><button type="button" data-action="stype" data-v="interval" class="'+(k.type==='interval'?'on':'')+'">Every N days</button></div></div>'+
  '<div data-show="days" '+(k.type==='days'?'':'hidden')+'><div class="f"><label>Days</label><div class="seg">'+[1,2,3,4,5,6,0].map(function(d){return '<button type="button" data-action="dchip" data-d="'+d+'" class="'+((k.days||[]).indexOf(d)>=0?'on':'')+'">'+DOW[d]+'</button>'}).join('')+'<button type="button" data-action="dall">Every day</button></div></div></div>'+
  '<div data-show="interval" '+(k.type==='interval'?'':'hidden')+'><div class="fr" style="grid-template-columns:1fr 1fr"><div class="f"><label>Every (days)</label><input name="every" type="number" min="1" max="730" value="'+(+k.every||30)+'"></div><div class="f"><label>Next due</label><input name="next" type="date" value="'+(isNew?today():nextOf(k))+'"></div></div></div>'+
  '<div class="f"><label>Steps (optional)</label><div data-steps>'+stepsEditor()+'</div><div class="stepctl"><button type="button" class="btn sm" data-action="addstep">+ Add step</button><label class="chk"><input type="checkbox" name="inorder"'+(k.stepsInOrder?' checked':'')+'> Must be done in order</label></div><small class="hint">With steps, tapping the chore opens its checklist, and the chore checks itself off when the last step is done.</small></div>'+
  '<div class="f"><label>Notes (optional)</label><textarea name="notes" maxlength="300">'+esc(k.notes||'')+'</textarea></div>'+
  '<div class="actions">'+(isNew?'':'<button type="button" class="btn danger" data-action="del">Delete</button>')+'<div class="grow"></div><button type="button" class="btn" data-action="close">Cancel</button><button type="submit" class="btn primary">Save</button></div></form></div>';
  modalEl.innerHTML=h;
}
function rangeStart(r){var t=today();return r==='year'?t.slice(0,4)+'-01-01':r==='month'?t.slice(0,7)+'-01':weekStart(t)}
function creditedTo(r,pid){return r&&(pid==='any'?!personById(r.by):r.by===pid)}
function openPersonView(pid,range){
  range=range||'week';
  var p=personById(pid)||{id:'any',name:pid==='any'?'Anyone / Unassigned':'?',color:ANY};
  ui.modal={kind:'personview',pid:pid,range:range};
  var t=today(), from=rangeStart(range);
  var byId={}; tasks().forEach(function(k){byId[k.id]=k});
  // history
  var dates=Object.keys(days).filter(function(d){return d>=from&&d<=t}).sort().reverse();
  var total=0,count=0,hist='';
  dates.forEach(function(d){
    var dd=days[d]; if(!dd||!dd.done) return;
    var items=Object.keys(dd.done).filter(function(id){return creditedTo(dd.done[id],pid)}).map(function(id){return {id:id,r:dd.done[id],k:byId[id]}}).sort(function(a,b){return (b.r.at||0)-(a.r.at||0)});
    if(!items.length) return;
    var dayPts=0;
    var rows=items.map(function(it){var pts=recPts(it.r,it.id);dayPts+=pts;total+=pts;count++;
      var tm=it.r.at?new Date(it.r.at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'';
      return '<div class="hrow"><span class="ico">'+esc(it.k?it.k.icon:'\u2022')+'</span><span class="t"><b>'+esc(it.k?it.k.name:'(deleted chore)')+'</b><span>'+esc(tm)+'</span></span><span class="hp">+'+pts+'</span></div>'}).join('');
    hist+='<div class="hday"><div class="hday-h"><b>'+(d===t?'Today':d===addDays(t,-1)?'Yesterday':esc(fmtLong(d)))+'</b><span>'+items.length+' done \u00B7 '+ptsLabel(dayPts)+'</span></div>'+rows+'</div>';
  });
  if(!hist) hist='<div class="empty">Nothing checked off '+(range==='week'?'this week':range==='month'?'this month':'this year')+' yet.</div>';
  // assigned chores
  var mine=tasks().filter(function(k){return pid==='any'?!personById(k.who):k.who===pid}).sort(byWhen);
  var todayIds=tasksFor(t).map(function(k){return k.id});
  function grp(title,list){ if(!list.length) return ''; return '<div class="sub">'+title+'</div>'+list.map(function(k){var due=todayIds.indexOf(k.id)>=0, dn=isDone(t,k.id);
      return '<div class="hrow"><span class="ico">'+esc(k.icon||'')+'</span><span class="t"><b>'+esc(k.name)+'</b><span>'+esc(schedText(k))+' \u00B7 '+ptsLabel(ptsOf(k))+'</span></span>'+(due?'<span class="tag '+(dn?'ok':'')+'">'+(dn?'\u2713 done today':'due today')+'</span>':'')+'</div>'}).join(''); }
  var daily=mine.filter(function(k){return k.type==='days'&&(k.days||[]).length===7}), weekly=mine.filter(function(k){return k.type==='days'&&(k.days||[]).length<7}), intv=mine.filter(function(k){return k.type==='interval'});
  var assigned=mine.length?grp('Every day',daily)+grp('Weekly',weekly)+grp('Every few weeks / months',intv)
    :'<div class="empty">No chores are assigned only to '+esc(p.name)+'. Chores set to \u201CAnyone\u201D still earn '+esc(p.name)+' points when checked off on a phone set to '+esc(p.name)+'.'+(canWrite()?' Assign chores in Setup.':'')+'</div>';
  var label={week:'This week',month:'This month',year:'This year'}[range];
  var h='<div class="scrim" data-action="scrim"><div class="sheet psheet"><div class="phead"><span class="pav" style="background:'+p.color+'">'+esc((p.name||'?').charAt(0).toUpperCase())+'</span><div><h2>'+esc(p.name)+'</h2><span class="muted">'+label+': <b>'+ptsLabel(total)+'</b> \u00B7 '+count+' chore'+(count===1?'':'s')+' done</span></div><button class="btn sm" data-action="close" style="margin-left:auto">Close</button></div>'+
    '<div class="seg" style="margin:4px 0 14px">'+['week','month','year'].map(function(r){return '<button type="button" data-action="prange" data-r="'+r+'" class="'+(r===range?'on':'')+'">'+{week:'Week',month:'Month',year:'Year'}[r]+'</button>'}).join('')+'</div>'+
    '<h3 class="ph">Completed</h3>'+hist+
    (pid==='any'?'':'<h3 class="ph" style="margin-top:18px">Assigned chores'+(mine.length?' ('+mine.length+')':'')+'</h3>'+assigned)+
    (pid==='any'?'<h3 class="ph" style="margin-top:18px">Chores for anyone ('+mine.length+')</h3>'+(mine.length?grp('Every day',daily)+grp('Weekly',weekly)+grp('Every few weeks / months',intv):'<div class="empty">None</div>'):'')+
    '</div></div>';
  modalEl.innerHTML=h;
  var sh=modalEl.querySelector('.sheet'); if(sh) sh.scrollTop=0;
}
function stepsEditor(){
  var st=(ui.modal&&ui.modal.steps)||[];
  return st.map(function(x,i){return '<div class="steprow"><span class="num">'+(i+1)+'</span><input data-sidx="'+i+'" value="'+esc(x.name)+'" placeholder="Step '+(i+1)+'" maxlength="80" enterkeyhint="next"><button type="button" class="ib" data-action="stepup" data-i="'+i+'" title="Move up"'+(i?'':' disabled')+'>\u2191</button><button type="button" class="ib" data-action="steprm" data-i="'+i+'" title="Remove">\u00D7</button></div>'}).join('');
}
function refreshStepsEditor(focusIdx){var box=modalEl.querySelector('[data-steps]'); if(!box) return; box.innerHTML=stepsEditor(); if(focusIdx!=null){var inp=box.querySelector('[data-sidx="'+focusIdx+'"]'); if(inp) inp.focus();}}
function openPerson(id){
  if(!canWrite()){toast('View only.');return}
  var p=personById(id), isNew=!p; p=p?clone(p):{name:'',color:PALETTE[people().length%PALETTE.length]};
  ui.modal={kind:'person',id:isNew?null:p.id,color:p.color};
  modalEl.innerHTML='<div class="scrim" data-action="scrim"><form class="sheet" data-form="person"><h2>'+(isNew?'Add person':'Edit person')+'</h2><div class="f"><label>Name</label><input name="name" required maxlength="30" value="'+esc(p.name)+'"></div><div class="f"><label>Color</label><div class="swatches">'+PALETTE.map(function(c){return '<button type="button" data-action="swatch" data-c="'+c+'" style="background:'+c+'" class="'+(c===p.color?'on':'')+'"></button>'}).join('')+'</div></div><div class="actions">'+(isNew||people().length<2?'':'<button type="button" class="btn danger" data-action="delperson">Remove</button>')+'<div class="grow"></div><button type="button" class="btn" data-action="close">Cancel</button><button type="submit" class="btn primary">Save</button></div></form></div>';
}
function ensureConfig(){ if(!config) config={v:1,people:[],tasks:[],settings:{screensaverMin:5}}; config.people=config.people||[];config.tasks=config.tasks||[];config.settings=config.settings||{screensaverMin:5}; }
function saveTaskForm(form){
  var m=ui.modal, f=form.elements;
  var name=f.name.value.trim(); if(!name){f.name.focus();return}
  if(m.type==='days'&&!m.days.length){toast('Pick at least one day.');return}
  ensureConfig();
  var k=m.id?config.tasks.filter(function(x){return x.id===m.id})[0]:null;
  if(!k){k={id:uid('t'),order:config.tasks.length?Math.max.apply(null,config.tasks.map(function(x){return x.order||0}))+1:0};config.tasks.push(k)}
  k.name=name;k.icon=m.icon||'✨';k.who=f.who.value;k.when=f.when.value;k.mins=Math.max(0,parseInt(f.mins.value,10)||0);var pv=parseInt(f.points.value,10);if(isNaN(pv))delete k.points;else k.points=Math.max(0,Math.min(999,pv));k.notes=f.notes.value.trim();var stl=(m.steps||[]).map(function(x){return {id:x.id||uid('s'),name:String(x.name||'').trim()}}).filter(function(x){return x.name});if(stl.length){k.steps=stl;k.stepsInOrder=!!f.inorder.checked}else{delete k.steps;delete k.stepsInOrder}k.type=m.type;
  if(m.type==='days'){k.days=m.days.slice().sort();delete k.every}
  else{k.every=Math.max(1,parseInt(f.every.value,10)||30);delete k.days}
  saveConfig();
  if(m.type==='interval'){var nd=f.next.value||today(); if(nd!==nextMap[k.id]) setNext(k.id,nd)}
  closeModal();toast('Saved');
}
function savePersonForm(form){
  var m=ui.modal, name=form.elements.name.value.trim(); if(!name) return;
  ensureConfig();
  var p=m.id?config.people.filter(function(x){return x.id===m.id})[0]:null;
  if(!p){p={id:uid('p')};config.people.push(p)}
  p.name=name;p.color=m.color;
  saveConfig();closeModal();
}

/* ---------- events ---------- */
document.addEventListener('click',function(e){
  var el=e.target.closest('[data-action]'); if(!el) return;
  var a=el.dataset.action, m=ui.modal;
  if(a==='scrim'){ if(e.target===el) closeModal(); return; }
  switch(a){
    case 'tab': ui.tab=el.dataset.tab; if(ui.tab==='today') ui.date=today(); try{history.replaceState(null,'','#'+ui.tab)}catch(_){} render(); window.scrollTo(0,0); break;
    case 'toggle': toggle(el.dataset.date,el.dataset.id,el.querySelector('.check')||el); break;
    case 'day': ui.date=addDays(ui.date,+el.dataset.n); render(); break;
    case 'gotoday': ui.date=today(); render(); break;
    case 'week': ui.weekOf=addDays(ui.weekOf,+el.dataset.n); render(); break;
    case 'thisweek': ui.weekOf=today(); render(); break;
    case 'month': var d=parse(ui.monthOf+'-01'); d.setMonth(d.getMonth()+(+el.dataset.n)); ui.monthOf=ymd(d).slice(0,7); render(); break;
    case 'thismonth': ui.monthOf=today().slice(0,7); render(); break;
    case 'openday': ui.date=el.dataset.date; ui.tab='today'; render(); window.scrollTo(0,0); break;
    case 'add': openTask(null); break;
    case 'edit': openTask(el.dataset.id); break;
    case 'addperson': openPerson(null); break;
    case 'editperson': openPerson(el.dataset.id); break;
    case 'person': openPersonView(el.dataset.pid,el.dataset.r); break;
    case 'step': stepToggle(el.dataset.sid); break;
    case 'addstep': m.steps.push({id:uid('s'),name:''}); refreshStepsEditor(m.steps.length-1); break;
    case 'steprm': m.steps.splice(+el.dataset.i,1); refreshStepsEditor(); break;
    case 'stepup': var si=+el.dataset.i; if(si>0){var tmp=m.steps[si-1];m.steps[si-1]=m.steps[si];m.steps[si]=tmp;} refreshStepsEditor(si-1); break;
    case 'prange': if(ui.modal&&ui.modal.kind==='personview') openPersonView(ui.modal.pid,el.dataset.r); break;
    case 'close': closeModal(); break;
    case 'emoji': m.icon=el.dataset.e; el.parentNode.querySelectorAll('button').forEach(function(b){b.style.outline=''}); el.style.outline='3px solid var(--accent)'; break;
    case 'stype': m.type=el.dataset.v; el.parentNode.querySelectorAll('button').forEach(function(b){b.classList.toggle('on',b===el)}); modalEl.querySelector('[data-show="days"]').hidden=m.type!=='days'; modalEl.querySelector('[data-show="interval"]').hidden=m.type!=='interval'; break;
    case 'dchip': var dd=+el.dataset.d, i=m.days.indexOf(dd); if(i>=0)m.days.splice(i,1); else m.days.push(dd); el.classList.toggle('on',i<0); break;
    case 'dall': m.days=[0,1,2,3,4,5,6]; el.parentNode.querySelectorAll('[data-action="dchip"]').forEach(function(b){b.classList.add('on')}); break;
    case 'swatch': m.color=el.dataset.c; el.parentNode.querySelectorAll('button').forEach(function(b){b.classList.toggle('on',b===el)}); break;
    case 'del':
      if(!el.classList.contains('armed')){el.classList.add('armed');el.textContent='Tap again to delete';return}
      config.tasks=config.tasks.filter(function(x){return x.id!==m.id}); saveConfig(); closeModal(); toast('Chore deleted'); break;
    case 'delperson':
      if(!el.classList.contains('armed')){el.classList.add('armed');el.textContent='Tap again: their chores go to “Anyone”';return}
      config.people=config.people.filter(function(x){return x.id!==m.id}); config.tasks.forEach(function(k){if(k.who===m.id)k.who='any'}); saveConfig(); closeModal(); break;
    case 'full': goFull(); break;
    case 'starter': if(!el.disabled){el.disabled=true;loadStarter()} break;
    case 'continue': doContinue(); break;
    case 'resend': doResend(); break;
    case 'signout': doSignOut(); break;
    case 'authmode': authUi.mode=authUi.mode==='signup'?'signin':'signup'; authUi.msg=''; render(); break;
    case 'forgot': doForgot(); break;
  }
});
document.addEventListener('submit',function(e){
  e.preventDefault();
  var f=e.target; if(f.dataset.form==='auth') doAuth(f); else if(f.dataset.form==='task') saveTaskForm(f); else if(f.dataset.form==='person') savePersonForm(f);
});
document.addEventListener('input',function(e){
  var el=e.target; if(!el||!el.form||el.form.dataset.form!=='task') return;
  var pts=el.form.elements.points; if(!pts) return;
  if(el.dataset&&el.dataset.sidx!=null){if(ui.modal&&ui.modal.steps&&ui.modal.steps[+el.dataset.sidx]) ui.modal.steps[+el.dataset.sidx].name=el.value;return}
  if(el.name==='points'){pts.dataset.auto='0';return}
  if(el.name==='mins'&&pts.dataset.auto==='1'){pts.value=Math.max(1,Math.round((parseInt(el.value,10)||0)/5))}
});
document.addEventListener('change',function(e){
  var el=e.target; if(el.dataset&&el.dataset.change==='me'){setMe(el.value);toast('Chores marked \u201CAnyone\u201D will be credited to '+((personById(el.value)||{}).name||'nobody')+' on this device');render();return}
  if(el.dataset&&el.dataset.change==='saver'){ensureConfig();config.settings.screensaverMin=+el.value;saveConfig();toast(+el.value?'Screensaver after '+el.value+' min':'Screensaver off')}
});
document.addEventListener('keydown',function(e){
  if(e.key==='Escape'&&ui.modal){closeModal();return}
  if(e.key==='Enter'&&e.target&&e.target.dataset&&e.target.dataset.sidx!=null){e.preventDefault();var m=ui.modal;if(m&&m.steps){m.steps.splice(+e.target.dataset.sidx+1,0,{id:uid('s'),name:''});refreshStepsEditor(+e.target.dataset.sidx+1)}}
});
function goFull(){
  try{
    if(document.fullscreenElement){document.exitFullscreen();return}
    var p=document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen();
    if(p&&p.catch) p.catch(function(){toast('Full screen isn’t allowed here. Use the browser’s full-screen or kiosk mode.')});
    else if(!p) toast('Full screen isn’t allowed here. Use the browser’s full-screen or kiosk mode.');
  }catch(err){toast('Full screen isn’t allowed here. Use the browser’s full-screen or kiosk mode.')}
}

/* ---------- clock, rollover, screensaver ---------- */
var lastAct=Date.now(), saverEl=null;
['pointerdown','keydown','touchstart','wheel'].forEach(function(ev){addEventListener(ev,function(){lastAct=Date.now()},{passive:true})});
function timeStr(){return new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}
function tickClock(){var s=timeStr();document.querySelectorAll('[data-clock]').forEach(function(c){c.textContent=s});}
function tick(){
  var t=today();
  if(t!==lastToday){ if(ui.date===lastToday) ui.date=t; if(ui.weekOf===lastToday) ui.weekOf=t; lastToday=t; if(!ui.modal) render(); }
  tickClock();
  var min=+settings().screensaverMin||0;
  if(min>0&&!saverEl&&!ui.modal&&Date.now()-lastAct>min*60000) showSaver();
  if(saverEl) fillSaver();
}
function showSaver(){saverEl=document.createElement('div');saverEl.className='saver';saverEl.addEventListener('click',function(e){e.stopPropagation();saverEl.remove();saverEl=null;lastAct=Date.now()});document.body.appendChild(saverEl);fillSaver()}
function fillSaver(){
  var t=today(), list=tasksFor(t), ppl=people(), parts=[];
  var groups=ppl.map(function(p){return {n:p.name,c:p.color,left:list.filter(function(k){return k.who===p.id&&!isDone(t,k.id)}).length}});
  var anyLeft=list.filter(function(k){return !personById(k.who)&&!isDone(t,k.id)}).length; if(anyLeft) groups.push({n:'Anyone',c:ANY,left:anyLeft});
  groups.forEach(function(g){parts.push('<span><i style="background:'+g.c+'"></i>'+esc(g.n)+': '+(g.left?g.left+' left':'done ⭐')+'</span>')});
  saverEl.innerHTML='<div class="big">'+esc(timeStr())+'</div><div class="d">'+esc(fmtLong(t))+'</div><div class="left">'+parts.join('')+'</div><div class="hint">Tap anywhere</div>';
}
setInterval(tick,10000);

/* ---------- fx ---------- */
var toastT=null;
function toast(msg){var o=document.querySelector('.toast');if(o)o.remove();var d=document.createElement('div');d.className='toast';d.textContent=msg;document.body.appendChild(d);clearTimeout(toastT);toastT=setTimeout(function(){d.remove()},2600)}
function burst(el,color){
  try{var r=el.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
  for(var i=0;i<12;i++){var s=document.createElement('span');s.className='spark';var a=i/12*Math.PI*2,dist=28+Math.random()*22;s.style.left=(cx-4)+'px';s.style.top=(cy-4)+'px';s.style.background=i%3?color:'#FFD43B';s.style.setProperty('--dx',Math.cos(a)*dist+'px');s.style.setProperty('--dy',Math.sin(a)*dist+'px');document.body.appendChild(s);setTimeout(s.remove.bind(s),700)}}catch(e){}
}
function confetti(){
  var cols=people().map(function(p){return p.color}).concat(['#FFD43B','#F08C00','#2F9E44','#1C7ED6']);
  for(var i=0;i<70;i++){var c=document.createElement('span');c.className='conf';c.style.left=Math.random()*100+'vw';c.style.background=cols[i%cols.length];c.style.animationDuration=(1.6+Math.random()*1.4)+'s';c.style.animationDelay=(Math.random()*.3)+'s';c.style.setProperty('--dx',(Math.random()*160-80)+'px');c.style.setProperty('--rot',(Math.random()*720-360)+'deg');c.style.borderRadius=Math.random()>.5?'2px':'50%';document.body.appendChild(c);setTimeout(c.remove.bind(c),3400)}
}

/* ---------- go ---------- */
render();
boot();
if('serviceWorker' in navigator){addEventListener('load',function(){navigator.serviceWorker.register('./sw.js').catch(function(){})})}
})();
