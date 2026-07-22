// ============================================================
// 山 Shan — app logic
// ES module. Loaded by index.html. Uses Supabase JS (from CDN,
// with a cached fallback) for auth + data; localStorage as an
// offline cache so logging works with no signal in the gym.
// ============================================================
// __V__ is stamped to the commit SHA by the deploy workflow — GitHub Pages
// caches JS for 10 min, and module imports are cached separately from app.js.
import { DAY_TITLES, weekInfo, transitionState, isRankBracket, defaultProgram } from "./program.js?v=__V__";
import { thresholdsFor, conservative1RM, tierIndex, percentileFor, TIERS, RANK_LIFTS } from "./ranks.js?v=__V__";

// tier pigments (ink-washed) — index by TIER family
const PIG = ["#3D3A34","#3D3A34","#3D3A34","#6E5A3A","#6E5A3A","#6E5A3A",
  "#8C8A82","#8C8A82","#8C8A82","#A98544","#A98544","#A98544",
  "#5E8A7B","#5E8A7B","#5E8A7B","#3F6E86","#3F6E86","#3F6E86",
  "#3A5E48","#3A5E48","#3A5E48","#7E3B34","#7E3B34","#7E3B34","#B78A3C"];
// tier CJK mark for the seal (family initial in Chinese numerals-ish glyphs)
const MARK = {Iron:"鐵",Bronze:"銅",Silver:"銀",Gold:"金",Platinum:"白",Diamond:"鑽",Ascendant:"昇",Immortal:"仙",Radiant:"耀"};
function fam(tierName){ return tierName.split(" ")[0]; }

const LS = {
  get:(k,d)=>{try{return JSON.parse(localStorage.getItem("shan:"+k))??d}catch{return d}},
  set:(k,v)=>localStorage.setItem("shan:"+k,JSON.stringify(v)),
};
const todayISO = (d=new Date())=> d.toLocaleDateString("en-CA"); // YYYY-MM-DD local

// ---------- photo store (IndexedDB) ----------
// Photos as base64 in localStorage blow its ~5 MB quota within weeks of daily
// use, and quota failures are silent. IndexedDB holds the compressed Blobs.
const photoDB = {
  _db: null,
  async open(){
    if(this._db) return this._db;
    this._db = await new Promise((res,rej)=>{
      const q = indexedDB.open("shan-photos", 1);
      q.onupgradeneeded = ()=> q.result.createObjectStore("photos");
      q.onsuccess = ()=> res(q.result);
      q.onerror = ()=> rej(q.error);
    });
    return this._db;
  },
  async put(date, blob){
    const db = await this.open();
    return new Promise((res,rej)=>{
      const tx = db.transaction("photos","readwrite");
      tx.objectStore("photos").put(blob, date);
      tx.oncomplete = ()=> res();
      tx.onerror = ()=> rej(tx.error);
    });
  },
  async get(date){
    const db = await this.open();
    return new Promise((res,rej)=>{
      const q = db.transaction("photos").objectStore("photos").get(date);
      q.onsuccess = ()=> res(q.result || null);
      q.onerror = ()=> rej(q.error);
    });
  },
  async dates(){
    const db = await this.open();
    return new Promise((res,rej)=>{
      const q = db.transaction("photos").objectStore("photos").getAllKeys();
      q.onsuccess = ()=> res(q.result || []);
      q.onerror = ()=> rej(q.error);
    });
  },
};
// one-time migration of legacy base64 photos out of localStorage
async function migratePhotos(){
  const legacy = Object.keys(localStorage).filter(k=>k.startsWith("shan:photo:"));
  for(const k of legacy){
    try{
      const dataURL = JSON.parse(localStorage.getItem(k));
      if(dataURL){
        const blob = await (await fetch(dataURL)).blob();
        await photoDB.put(k.slice("shan:photo:".length), blob);
      }
      localStorage.removeItem(k);
    }catch(e){ console.warn("photo migration failed for", k, e); }
  }
}

// ---------- Supabase client (lazy, resilient) ----------
let sb = null, user = null;
async function initSupabase(){
  const cfg = window.SHAN_CONFIG||{};
  if(!cfg.SUPABASE_URL || cfg.SUPABASE_URL==="PASTE_HERE"){ return null; }
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  sb = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON, { auth:{persistSession:true} });
  const { data } = await sb.auth.getSession();
  user = data?.session?.user||null;
  return sb;
}

// ---------- state ----------
let settings = LS.get("settings", {
  program_start: todayISO(),
  bodyweight_lb: null,
  deload_weeks: [],   // absolute week numbers tagged as deload (excluded from trends)
  habits: [
    {key:"cal",label:"Ate 2600 calories"},{key:"protein",label:"170g protein"},
    {key:"sleep",label:"Slept 8 hours"},{key:"creatine",label:"Took creatine"},
    {key:"read",label:"Read 5 minutes"},{key:"puzzle",label:"5 minutes of puzzles"},
    {key:"mandarin",label:"Spoke Mandarin 5 min"},{key:"social",label:"Talked to one person"},
  ],
});
let viewDate = todayISO();

// ---------- data access (cache-first, sync when online+authed) ----------
async function loadDay(date){
  let day = LS.get("day:"+date, null);
  let work = LS.get("work:"+date, null);
  if(sb && user){
    try{
      const [d,w] = await Promise.all([
        sb.from("daily_logs").select("*").eq("user_id",user.id).eq("log_date",date).maybeSingle(),
        sb.from("workout_logs").select("*").eq("user_id",user.id).eq("log_date",date),
      ]);
      if(d.data){ day=d.data; LS.set("day:"+date,day); }
      if(w.data){ work=w.data; LS.set("work:"+date,work); }
    }catch(e){/* offline: keep cache */}
  }
  return { day: day||{log_date:date,habits_done:{},bodyweight_lb:null,photo_path:null}, work: work||[] };
}

async function saveWorkout(date, dayType, ex, bracket, sets, pain, painNote, fun){
  // conservative 1RM only from a heavy (4-6) set; take best set's estimate
  let est=null;
  if(isRankBracket(bracket)){
    for(const s of sets){ if(s.weight&&s.reps>=4&&s.reps<=6){ const e=conservative1RM(s.weight,s.reps); if(!est||e>est)est=e; } }
  }
  const row = { user_id:user?.id, log_date:date, day_type:dayType, exercise:ex,
    rep_bracket:bracket, sets, pain, pain_note:painNote, fun, est_1rm:est };
  // cache
  const cache = LS.get("work:"+date,[]).filter(r=>r.exercise!==ex); cache.push(row); LS.set("work:"+date,cache);
  LS.set("pending", [...LS.get("pending",[]), {t:"work",row}]);
  if(sb&&user){ try{
    await sb.from("workout_logs").upsert(row,{onConflict:"user_id,log_date,exercise"});
    clearPending();
  }catch(e){/* stays pending */} }
  // rank updates locally even offline; updateRank guards its own network sync
  let ranked=false;
  if(est) ranked = await updateRank(ex, est, date);
  return { est, ranked };
}

async function saveDay(date, patch){
  const cur = LS.get("day:"+date, {log_date:date,habits_done:{}});
  const row = {...cur, ...patch, user_id:user?.id, log_date:date};
  LS.set("day:"+date,row);
  LS.set("pending", [...LS.get("pending",[]), {t:"day",row}]);
  if(sb&&user){ try{ await sb.from("daily_logs").upsert(row,{onConflict:"user_id,log_date"}); clearPending(); }catch(e){} }
}

function clearPending(){ LS.set("pending",[]); }
async function flushPending(){
  if(!(sb&&user)) return;
  const p = LS.get("pending",[]); if(!p.length) return;
  for(const item of p){ try{
    if(item.t==="work") await sb.from("workout_logs").upsert({...item.row,user_id:user.id},{onConflict:"user_id,log_date,exercise"});
    if(item.t==="day")  await sb.from("daily_logs").upsert({...item.row,user_id:user.id},{onConflict:"user_id,log_date"});
  }catch(e){return;} }
  clearPending();
}

// ---------- rank update (current + peak, can go down) ----------
async function updateRank(exKey, est1rm, date){
  const lift = RANK_LIFTS[exKey] ? exKey : null; if(!lift) return false;
  const bw = settings.bodyweight_lb || (LS.get("day:"+date,{}).bodyweight_lb) || settings.bodyweight_lb;
  if(!bw) return false;
  const idx = tierIndex(lift, est1rm, bw), ratio = est1rm/bw;
  let rank = LS.get("rank:"+lift, {current_tier:0,peak_tier:0});
  const prevPeak1rm = rank.peak_1rm || 0;
  rank.current_tier = idx; rank.current_1rm = est1rm; rank.current_ratio = ratio; // LIVE — can drop
  if(idx >= rank.peak_tier){ rank.peak_tier=idx; rank.peak_1rm=est1rm; rank.peak_date=date; }
  if(prevPeak1rm && est1rm > prevPeak1rm) sealPress(); // true 1RM PR
  LS.set("rank:"+lift, rank);
  if(sb&&user){ try{
    await sb.from("ranks").upsert({user_id:user.id,exercise:lift,...rank},{onConflict:"user_id,exercise"});
    await sb.from("rank_history").insert({user_id:user.id,exercise:lift,log_date:date,tier:idx,est_1rm:est1rm,ratio});
  }catch(e){} }
  return true;
}

// ============================================================
// RENDERING
// ============================================================
const app = document.getElementById("app");
let activeTab = "today";

function brush(){ // signature ink divider (SVG, tapered)
  return `<svg class="brush" viewBox="0 0 340 14" preserveAspectRatio="none" aria-hidden="true">
    <path d="M2,8 C60,3 90,11 150,7 C210,3 250,10 338,6" fill="none" stroke="var(--bronze)"
      stroke-width="2.2" stroke-linecap="round" opacity="0.8"/></svg>`;
}

function mast(sub){
  return `<header class="mast"><span class="mark">山</span>
    <span class="display" style="font-size:20px">Shan</span>
    <span class="sub">${sub||""}</span></header>`;
}

async function renderToday(){
  const wi = weekInfo(settings.program_start, new Date(viewDate+"T12:00:00"));
  const dayType = dayTypeForDate(viewDate);
  const tr = transitionState(wi.weekNum);
  const {day, work} = await loadDay(viewDate);
  const workBy = Object.fromEntries(work.map(w=>[w.exercise,w]));

  const isDeload=(settings.deload_weeks||[]).includes(wi.weekNum);
  let html = mast(`Week ${wi.weekOrdinal} · ${wi.bracket}${isDeload?" · 休 deload":""}`);
  const isToday = viewDate===todayISO();
  const dateLabel = isToday ? "today"
    : new Date(viewDate+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"});
  html += `<div class="daybar">
    <button class="nav" id="prevDay" aria-label="previous day">‹</button>
    <span class="eyebrow" style="margin:0;flex:1">${dayTitle(dayType)}</span>
    <button class="datechip mono" id="dateChip" title="back to today">${dateLabel}</button>
    <button class="nav" id="nextDay" aria-label="next day" ${isToday?"disabled":""}>›</button></div>`;
  html += brush();

  if(dayType==="rest"){
    html += `<div class="empty">Rest day · 息. Log bodyweight and today's practices below.</div>`;
  } else {
    for(const ex of dayExercises(dayType)){
      const logged = workBy[ex.key];
      const rankBadge = ex.rank ? `<span class="eyebrow" style="margin:0;color:var(--cinnabar)">rank lift</span>`:"";
      let nm = ex.name;
      if(ex.transition==="weighted"&&tr.past6) nm = "Weighted "+nm.toLowerCase();
      if(ex.key==="calf") nm = tr.calf;
      if(ex.key==="db_shoulder_press") nm += `  <span class="approx">per-dumbbell lb · standards approximate</span>`;
      if(ex.key==="rdl") nm += `  <span class="approx">judged on deadlift standards</span>`;
      const nSets = ex.sets;
      html += `<div class="ex" data-ex="${ex.key}" data-type="${dayType}">
        <div class="top"><span class="name">${nm}</span> ${rankBadge}
          <span class="bracket">${wi.bracket}</span></div>`;
      for(let i=0;i<nSets;i++){
        const s = logged?.sets?.[i]||{};
        html += `<div class="setrow ${logged?'logged':''}">
          <span class="idx">${i+1}</span>
          <input class="w" inputmode="decimal" placeholder="lb" value="${s.weight??""}">
          <span class="x">×</span>
          <input class="r" inputmode="numeric" placeholder="rp" value="${s.reps??""}">
          <span class="unit">reps</span><span class="wick"></span></div>`;
      }
      const painOn = logged?.pain?"on":"", fun=logged?.fun||0;
      html += `<div class="meta">
        <span class="lbl">pain</span><span class="dot ${painOn}" data-pain></span>
        <span class="lbl">fun</span><span class="funset">${[1,2,3,4,5].map(n=>`<span class="fun ${fun>=n?'on':''}" data-fun="${n}"></span>`).join("")}</span>
        <button class="ghost" data-log>Log</button></div>`;
      if(logged?.pain) html += `<input class="note" data-painnote placeholder="what hurt?" value="${logged.pain_note||""}">`;
      html += `</div>`;
    }
  }
  html += brush();
  // bodyweight + photo + habits live on Today too (single-screen flow)
  html += `<div class="eyebrow">Body & practices</div>`;
  html += `<div class="daybar"><span class="lbl">bodyweight</span>
    <input class="w mono" id="bw" inputmode="decimal" placeholder="lb" value="${day.bodyweight_lb??""}">
    <span class="unit">lb</span>
    <button class="ghost" id="photoBtn">Photo</button>
    <input type="file" id="photoInput" accept="image/*" capture="environment" hidden></div>`;
  html += `<div id="photoWrap"></div>`;
  html += `<div id="habits"></div>`;
  html += `<button class="act finish" id="finishDay">Finish day</button>`;
  app.innerHTML = html;

  wireToday(dayType);
  renderPhoto(day);
  renderHabits(day);
}

function wireToday(dayType){
  app.querySelectorAll(".ex").forEach(block=>{
    const exKey=block.dataset.ex;
    block.querySelector("[data-pain]")?.addEventListener("click",e=>e.target.classList.toggle("on"));
    block.querySelectorAll("[data-fun]").forEach(f=>f.addEventListener("click",()=>{
      const n=+f.dataset.fun; block.querySelectorAll(".fun").forEach(x=>x.classList.toggle("on",+x.dataset.fun<=n));
    }));
    block.querySelector("[data-log]")?.addEventListener("click",async()=>{
      const wi = weekInfo(settings.program_start, new Date(viewDate+"T12:00:00"));
      const sets=[...block.querySelectorAll(".setrow")].map(r=>({
        weight:parseFloat(r.querySelector(".w").value)||null,
        reps:parseInt(r.querySelector(".r").value)||null })).filter(s=>s.weight||s.reps);
      const pain=block.querySelector("[data-pain]").classList.contains("on");
      const painNote=block.querySelector("[data-painnote]")?.value||null;
      const fun=block.querySelectorAll(".fun.on").length||null;
      const {est,ranked}=await saveWorkout(viewDate,dayType,exKey,wi.bracket,sets,pain,painNote,fun);
      block.querySelectorAll(".setrow").forEach(r=>r.classList.add("logged"));
      if(est && RANK_LIFTS[exKey]) toast(ranked?`1RM ~${Math.round(est)} lb · rank updated`:`1RM ~${Math.round(est)} lb · log bodyweight to rank`);
      else toast("Logged");
    });
  });
  document.getElementById("bw").addEventListener("change",e=>{
    const v=parseFloat(e.target.value)||null; settings.bodyweight_lb=v; LS.set("settings",settings);
    saveDay(viewDate,{bodyweight_lb:v}); if(sb&&user) syncSettings();
  });
  document.getElementById("photoBtn").addEventListener("click",()=>document.getElementById("photoInput").click());
  document.getElementById("photoInput").addEventListener("change",onPhoto);
  document.getElementById("prevDay").addEventListener("click",()=>shiftDay(-1));
  document.getElementById("nextDay").addEventListener("click",()=>shiftDay(1));
  document.getElementById("dateChip").addEventListener("click",()=>{viewDate=todayISO();renderToday();});
  document.getElementById("finishDay").addEventListener("click",finishDay);
}

// Close out the day: clouds sweep in over the screen with a word of
// encouragement, then dissipate and drop back to Today. Timings are driven by
// setTimeout (not animationend) so it still returns cleanly under
// prefers-reduced-motion, where the animations are suppressed.
function finishDay(){
  const veil=document.createElement("div");
  veil.className="cloudveil";
  veil.innerHTML=`${[0,1,2,3,4].map(i=>`<span class="cloud c${i}"></span>`).join("")}
    <div class="cloudmsg">Great job today.<br><span class="cjk">加油！</span></div>`;
  document.body.appendChild(veil);
  requestAnimationFrame(()=>veil.classList.add("in"));
  setTimeout(()=>veil.classList.add("out"), 1900);
  setTimeout(()=>{
    veil.remove();
    viewDate=todayISO();
    go("today");
  }, 2900);
}
function shiftDay(n){
  const d=new Date(viewDate+"T12:00:00"); d.setDate(d.getDate()+n);
  const iso=todayISO(d);
  if(iso>todayISO()) return; // no logging the future
  viewDate=iso; renderToday();
}

// ---------- photo: compress client-side, store in Supabase Storage ----------
async function onPhoto(e){
  const file=e.target.files[0]; if(!file) return;
  const blob=await compress(file, 1080, .8);
  const path=`${user?user.id:"local"}/${viewDate}.jpg`;
  try{ await photoDB.put(viewDate, blob); }
  catch(err){ toast("Photo could not be saved on this device"); console.warn(err); }
  renderPhoto({photo_path:path});
  if(sb&&user){ try{
    await sb.storage.from("physique").upload(path,blob,{upsert:true,contentType:"image/jpeg"});
    await saveDay(viewDate,{photo_path:path});
  }catch(err){ toast("Photo saved locally · will sync"); } }
  else saveDay(viewDate,{photo_path:path});
}
function compress(file,max,q){ return new Promise(res=>{
  const img=new Image(); const url=URL.createObjectURL(file);
  img.onload=()=>{
    URL.revokeObjectURL(url);
    let{width:w,height:h}=img; const scale=Math.min(1,max/Math.max(w,h)); w*=scale;h*=scale;
    const c=document.createElement("canvas");c.width=w;c.height=h;
    c.getContext("2d").drawImage(img,0,0,w,h); c.toBlob(res,"image/jpeg",q);
  }; img.src=url;
});}
async function renderPhoto(day, date=viewDate, wrapEl=null){
  const wrap=wrapEl||document.getElementById("photoWrap"); if(!wrap) return;
  let blob=null; try{ blob=await photoDB.get(date); }catch(e){}
  if(blob){
    const url=URL.createObjectURL(blob);
    wrap.innerHTML=`<div class="photo-frame"><img src="${url}" alt="physique ${date}"></div>`;
    wrap.querySelector("img").addEventListener("load",()=>URL.revokeObjectURL(url));
    return;
  }
  if(day.photo_path && sb && user){ try{
    const {data}=await sb.storage.from("physique").createSignedUrl(day.photo_path,3600);
    if(data?.signedUrl){ wrap.innerHTML=`<div class="photo-frame"><img src="${data.signedUrl}"></div>`; return; }
  }catch(e){} }
  wrap.innerHTML="";
}

// ---------- habits ----------
function renderHabits(day){
  const el=document.getElementById("habits"); if(!el) return;
  const done=day.habits_done||{};
  el.innerHTML = `<div class="eyebrow" style="margin-top:8px">Daily practices</div>`+
    settings.habits.map(h=>`<div class="habit ${done[h.key]?'done':''}" data-h="${h.key}">
      <span class="check">${checkSVG(!!done[h.key])}</span><span class="txt">${h.label}</span></div>`).join("");
  el.querySelectorAll(".habit").forEach(row=>row.addEventListener("click",()=>{
    const k=row.dataset.h; const cur=LS.get("day:"+viewDate,{habits_done:{}}).habits_done||{};
    cur[k]=!cur[k]; row.classList.toggle("done",cur[k]);
    row.querySelector(".check").innerHTML=checkSVG(cur[k]);
    saveDay(viewDate,{habits_done:cur});
    updateEnso(cur);
  }));
  updateEnso(done);
}
// enso ring around the day once every practice is complete
function updateEnso(habitsDone){
  const chip=document.getElementById("dateChip"); if(!chip) return;
  const all=settings.habits.length>0 && settings.habits.every(h=>habitsDone?.[h.key]);
  chip.classList.toggle("enso", all);
}
function checkSVG(on){
  return `<svg viewBox="0 0 30 30" width="30" height="30">
    <circle cx="15" cy="15" r="12" fill="none" stroke="var(--ink-faint)" stroke-width="1.5"/>
    ${on?`<path d="M9,15 l4,4 l8,-9" fill="none" stroke="var(--jade)" stroke-width="2.4"
      stroke-linecap="round" stroke-linejoin="round" style="stroke-dasharray:22;stroke-dashoffset:0;
      animation:none"/>`:""}</svg>`;
}

// ---------- ranks view ----------
function renderRanks(){
  let html=mast("Seals · 印");
  html+=`<div class="eyebrow">Rank-bearing lifts</div>`;
  html+=`<p class="lbl" style="margin:2px 0 6px">Ranks come only from your heavy 4–6 rep sets, judged against your bodyweight. Tap a seal for the full ladder.</p>`;
  html+=brush();
  html+=`<div style="display:flex;gap:22px;flex-wrap:wrap;margin-top:8px">`;
  for(const [key,label] of Object.entries(RANK_LIFTS)){
    const r=LS.get("rank:"+key,{current_tier:0,peak_tier:0});
    const t=TIERS[r.current_tier], pg=PIG[r.current_tier];
    html+=`<div class="seal" data-seal="${key}">
      <div class="stamp" style="background:${pg}"><span class="cjk">${MARK[fam(t)]}</span></div>
      <span class="tier">${t}</span>
      <span class="lbl" style="font-size:12px">${label.replace('Barbell ','').replace('Dumbbell ','DB ')}</span>
    </div>`;
  }
  html+=`</div>`;
  app.innerHTML=html;
  app.querySelectorAll("[data-seal]").forEach(s=>s.addEventListener("click",()=>openLadder(s.dataset.seal)));
}

function openLadder(key){
  const bw=settings.bodyweight_lb||185;
  const th=thresholdsFor(key);
  const r=LS.get("rank:"+key,{current_tier:0,peak_tier:0});
  const rows=TIERS.map((t,i)=>{
    const lb=Math.round(th[i]*bw);
    // percentile matching the actual threshold construction: even 3rd→95th
    // spread up to Diamond 3, then the super-elite tail eases toward top 1%
    const p = i<=17 ? 3+(i/17)*92 : 95+((i-17)/7)*4;
    const top=Math.max(1,Math.round(100-p));
    return `<div class="rung ${i===r.current_tier?'cur':''} ${i===r.peak_tier?'peak':''}">
      <span class="pip" style="background:${PIG[i]}"></span>
      <span class="nm">${t}</span><span class="wt mono">${lb} lb</span>
      <span class="pc">top ${top}%</span></div>`;
  }).join("");
  const cur=TIERS[r.current_tier];
  const sheet=`<div class="scrim open" id="scrim"><div class="sheet">
    <div class="eyebrow">${RANK_LIFTS[key]}</div>
    <h2 class="sec">${cur}</h2>
    <p class="lbl">Current 1RM ~${r.current_1rm?Math.round(r.current_1rm):"—"} lb at ${bw} lb bodyweight.
    Peak: ${TIERS[r.peak_tier]}${r.peak_1rm?` (${Math.round(r.peak_1rm)} lb)`:""}.</p>
    ${key==="db_shoulder_press"?`<p class="lbl" style="font-style:italic">Weights are per dumbbell. Standards approximate.</p>`:""}
    ${key==="rdl"?`<p class="lbl" style="font-style:italic">Judged on conventional-deadlift standards — this ladder runs deliberately hard for an RDL.</p>`:""}
    ${brush()}
    <div class="ladder">${rows}</div>
    <div style="margin-top:18px"><button class="act" id="closeLadder">Close</button></div>
  </div></div>`;
  const div=document.createElement("div"); div.innerHTML=sheet; document.body.appendChild(div);
  const scrim=div.querySelector("#scrim");
  scrim.querySelector("#closeLadder").addEventListener("click",()=>div.remove());
  scrim.addEventListener("click",e=>{if(e.target===scrim)div.remove();});
  // scroll current into view
  setTimeout(()=>scrim.querySelector(".rung.cur")?.scrollIntoView({block:"center"}),60);
}

// ---------- program accessors ----------
// The whole app reads the program through these, so a user's custom
// settings.program transparently replaces the hardcoded default everywhere.
function activeProgram(){ return settings.program || defaultProgram(); }
// weekday (0=Sun..6=Sat) → day id, using the current schedule
function dayTypeForDate(date){ return activeProgram().schedule[new Date(date+"T12:00:00").getDay()] || "rest"; }
// day metadata, always resolvable: custom → default → sensible fallback so that
// old logs referencing a since-deleted day still render.
function dayDef(id){ return activeProgram().days[id] || defaultProgram().days[id] || null; }
function dayTitle(id){ return id==="rest" ? DAY_TITLES.rest : (dayDef(id)?.title || id); }
function dayExercises(id){ return dayDef(id)?.exercises || []; }
function dayFamily(id){ return dayDef(id)?.family || (id||"rest").split("_")[0]; }

// How a calendar day stands re: attendance. A "missed" day is the feature's
// definition of an unattended workout: a scheduled (non-rest) day, now in the
// past, with zero exercises logged. Today with nothing logged yet is "pending",
// not missed — the day isn't over. Future and rest days are neither.
function attendanceState(date, workLen){
  const today=todayISO();
  if(date>today) return "future";
  const dayType = dayTypeForDate(date);
  if(dayType==="rest") return "rest";
  if(workLen>0) return "attended";
  return date===today ? "pending" : "missed";
}

// ---------- history (誌): month calendar → day sheet ----------
let histMonth = null; // "YYYY-MM"

async function renderHistory(){
  if(!histMonth) histMonth = todayISO().slice(0,7);
  const [y,m] = histMonth.split("-").map(Number);
  const first = new Date(y, m-1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const today = todayISO(), thisMonth = today.slice(0,7);

  let photoDates = new Set();
  try{ photoDates = new Set(await photoDB.dates()); }catch(e){}

  // signed in: refresh this month's rows into the local cache in two range queries
  if(sb&&user){ try{
    const start=`${histMonth}-01`, end=`${histMonth}-${String(daysInMonth).padStart(2,"0")}`;
    const [d,w] = await Promise.all([
      sb.from("daily_logs").select("*").eq("user_id",user.id).gte("log_date",start).lte("log_date",end),
      sb.from("workout_logs").select("*").eq("user_id",user.id).gte("log_date",start).lte("log_date",end),
    ]);
    for(const row of d.data||[]) LS.set("day:"+row.log_date,row);
    const byDate={}; for(const row of w.data||[]) (byDate[row.log_date]=byDate[row.log_date]||[]).push(row);
    for(const [k,v] of Object.entries(byDate)) LS.set("work:"+k,v);
  }catch(e){/* offline: render from cache */} }

  let html = mast("History · 誌");
  const monthName = first.toLocaleDateString("en-US",{month:"long",year:"numeric"});
  html += `<div class="daybar">
    <button class="nav" id="prevMonth" aria-label="previous month">‹</button>
    <span class="eyebrow" style="margin:0;flex:1;text-align:center">${monthName}</span>
    <button class="nav" id="nextMonth" aria-label="next month" ${histMonth>=thisMonth?"disabled":""}>›</button></div>`;
  html += brush();
  html += `<div class="cal">`;
  for(const wd of ["S","M","T","W","T","F","S"]) html += `<span class="cal-h">${wd}</span>`;
  for(let i=0;i<first.getDay();i++) html += `<span></span>`;
  for(let n=1;n<=daysInMonth;n++){
    const date = `${histMonth}-${String(n).padStart(2,"0")}`;
    const day = LS.get("day:"+date,null), work = LS.get("work:"+date,[])||[];
    const hasPhoto = photoDates.has(date) || !!day?.photo_path;
    const allHabits = !!day && settings.habits.length>0 && settings.habits.every(h=>day.habits_done?.[h.key]);
    const state = attendanceState(date, work.length);
    // colour an attended day by what was actually logged (the schedule may have
    // changed since); fall back to the scheduled day for everything else.
    const fam = dayFamily(work[0]?.day_type || dayTypeForDate(date));
    const typeClass = state==="attended" ? `type-${fam}` : (state==="missed" ? "missed" : "");
    html += `<button class="cal-d ${date===today?'today':''} ${allHabits?'enso':''} ${typeClass}"
      data-date="${date}" ${date>today?"disabled":""}>
      <span class="n">${n}</span>
      <span class="dots">${state==="attended"?`<i class="d ${fam}"></i>`:''}${hasPhoto?'<i class="d bronze"></i>':''}</span>
    </button>`;
  }
  html += `</div>`;
  html += `<p class="lbl" style="margin-top:16px;line-height:1.9">
    <i class="d push"></i> push &ensp; <i class="d pull"></i> pull &ensp; <i class="d legs"></i> legs &ensp;
    <i class="d bronze"></i> photo<br>
    <span class="miss-key"></span> missed session &ensp; <span style="color:var(--jade)">○</span> all practices</p>`;
  app.innerHTML = html;
  document.getElementById("prevMonth").addEventListener("click",()=>shiftMonth(-1));
  document.getElementById("nextMonth").addEventListener("click",()=>shiftMonth(1));
  app.querySelectorAll(".cal-d:not([disabled])").forEach(b=>
    b.addEventListener("click",()=>openDaySheet(b.dataset.date)));
}

function shiftMonth(n){
  const [y,m] = histMonth.split("-").map(Number);
  const d = new Date(y, m-1+n, 1);
  histMonth = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  renderHistory();
}

// day detail: that day's data points and photo, side by side
async function openDaySheet(date){
  const {day, work} = await loadDay(date);
  const d = new Date(date+"T12:00:00");
  // prefer the day type that was logged; fall back to the current schedule
  const dayType = work[0]?.day_type || dayTypeForDate(date);
  const title = d.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"});

  let body = `<div class="eyebrow">${title}</div><h2 class="sec">${dayTitle(dayType)}</h2>`+brush();
  body += `<div id="sheetPhoto" style="margin-bottom:10px"></div>`;
  if(day.bodyweight_lb) body += `<div class="stat"><span class="k">bodyweight</span><span class="v mono">${day.bodyweight_lb} lb</span></div>`;
  if(work.length){
    for(const w of work){
      const sets = (w.sets||[]).map(s=>`${s.weight??"—"}×${s.reps??"—"}`).join("&ensp;");
      const fun = w.fun ? `&ensp;<span style="color:var(--jade)">${"●".repeat(w.fun)}</span>` : "";
      body += `<div class="stat"><span class="k">${PROGRAM_NAME(w.exercise)||w.exercise}${w.pain?' <span style="color:var(--cinnabar)">· pain</span>':''}</span>
        <span class="v mono">${sets}${fun}</span></div>`;
      if(w.pain && w.pain_note) body += `<p class="lbl" style="margin:4px 0 8px;color:var(--cinnabar)">${w.pain_note}</p>`;
    }
  } else body += `<div class="empty">No sets logged.</div>`;
  const done = day.habits_done||{};
  const doneList = settings.habits.filter(h=>done[h.key]).map(h=>h.label);
  if(doneList.length) body += `<p class="lbl" style="margin-top:12px">Practices: ${doneList.join(" · ")}</p>`;
  body += `<div style="margin-top:18px;display:flex;gap:10px">
    <button class="ghost" id="openInToday">Open in Today</button>
    <button class="act" id="closeSheet">Close</button></div>`;

  const div = document.createElement("div");
  div.innerHTML = `<div class="scrim open" id="dayScrim"><div class="sheet">${body}</div></div>`;
  document.body.appendChild(div);
  const scrim = div.querySelector("#dayScrim");
  scrim.querySelector("#closeSheet").addEventListener("click",()=>div.remove());
  scrim.querySelector("#openInToday").addEventListener("click",()=>{ div.remove(); viewDate=date; go("today"); });
  scrim.addEventListener("click",e=>{ if(e.target===scrim) div.remove(); });
  renderPhoto(day, date, scrim.querySelector("#sheetPhoto"));
}

// ---------- analytics (renders from the first logged set; the 6-week
// block is just a heading, not a gate) ----------
async function renderAnalytics(){
  let html=mast("Reflection · 徑");
  const wi=weekInfo(settings.program_start);
  const block=Math.floor(wi.weekNum/6)+1;
  html+=`<div class="eyebrow">6-week block ${block} · week ${wi.weekOrdinal}</div>`+brush();

  // pull last ~42 days of workout logs from cache (+ supabase if available)
  const since=new Date(); since.setDate(since.getDate()-42);
  let logs=[];
  if(sb&&user){ try{
    const {data}=await sb.from("workout_logs").select("*").eq("user_id",user.id).gte("log_date",todayISO(since));
    logs=data||[];
  }catch(e){} }
  if(!logs.length){ // fallback to cache scan
    for(let i=0;i<42;i++){ const d=new Date(); d.setDate(d.getDate()-i);
      logs.push(...LS.get("work:"+todayISO(d),[])); }
  }

  // est-1RM history per exercise, deload weeks excluded. Any logged set feeds
  // the trend now, not only heavy ones: a heavy 4–6 set keeps its rank-grade
  // stored estimate, and every other set gets an on-the-fly conservative
  // estimate, so the charts populate from the first set even in a high-rep week.
  // (Ranks and their pills still move on heavy sets only — that path is untouched.)
  const dlSet=new Set(settings.deload_weeks||[]);
  const byEx={};
  logs.forEach(l=>{
    if(dlSet.has(weekInfo(settings.program_start,new Date(l.log_date+"T12:00:00")).weekNum)) return;
    const est = l.est_1rm ?? bestEst(l.sets);
    if(est==null) return;
    (byEx[l.exercise]=byEx[l.exercise]||[]).push({log_date:l.log_date, est});
  });
  for(const arr of Object.values(byEx)) arr.sort((a,b)=>a.log_date.localeCompare(b.log_date));

  // per-exercise deltas — no longer shown as rows (the chart replaces them) but
  // still feed the plain-language Summary at the bottom.
  const moves=[];
  for(const [ex,arr] of Object.entries(byEx)){
    const last=arr[arr.length-1].est;
    const delta=arr.length<2 ? null : last-arr[0].est;
    moves.push({ex,delta,base:last,pct:delta==null?0:delta/arr[0].est,lastDate:arr[arr.length-1].log_date});
  }
  moves.sort((a,b)=>b.pct-a.pct);

  // rank ladder over time: tier index per heavy session. Ranks move only on
  // heavy 4–6 sets (est_1rm present) and need a bodyweight to judge against;
  // points missing either are skipped.
  const rankSeries={};
  logs.forEach(l=>{
    if(!RANK_LIFTS[l.exercise] || l.est_1rm==null) return;
    if(dlSet.has(weekInfo(settings.program_start,new Date(l.log_date+"T12:00:00")).weekNum)) return;
    const bw=LS.get("day:"+l.log_date,{})?.bodyweight_lb || settings.bodyweight_lb;
    if(!bw) return;
    (rankSeries[l.exercise]=rankSeries[l.exercise]||[]).push({log_date:l.log_date, tier:tierIndex(l.exercise,l.est_1rm,bw)});
  });
  for(const arr of Object.values(rankSeries)) arr.sort((a,b)=>a.log_date.localeCompare(b.log_date));

  // ----- Ranks graph: pick a lift; fixed 0–24 tier axis -----
  html+=`<h2 class="sec">Ranks</h2>`;
  const rankKeys=Object.keys(RANK_LIFTS);
  const rankDefault=rankKeys.find(k=>rankSeries[k]?.length)||rankKeys[0];
  html+=`<select class="exsel" id="ranksSel">`+
    rankKeys.map(k=>`<option value="${k}" ${k===rankDefault?"selected":""}>${RANK_LIFTS[k]}</option>`).join("")+`</select>`;
  html+=`<div class="chartwrap" id="ranksChart">${rankChart(rankSeries[rankDefault]||[])}</div>`;
  html+=`<p class="lbl chartcap">tier index · 0 Iron → 24 Radiant · x = date</p>`;

  // ----- Strength graph: pick any lift; est-1RM axis rescales per lift -----
  html+=`<h2 class="sec" style="margin-top:18px">Strength trend</h2>`;
  if(dlSet.size) html+=`<p class="lbl" style="margin:0 0 6px">Deload weeks excluded.</p>`;
  const strKeys=Object.keys(byEx);
  if(!strKeys.length){
    html+=`<div class="empty">No weighted sets logged yet.</div>`;
  } else {
    html+=`<select class="exsel" id="strSel">`+
      strKeys.map(k=>`<option value="${k}">${PROGRAM_NAME(k)||k}</option>`).join("")+`</select>`;
    html+=`<div class="chartwrap" id="strChart">${strengthChart(byEx[strKeys[0]])}</div>`;
    html+=`<p class="lbl chartcap">est 1RM (lb) · x = date</p>`;
  }

  // ----- Attendance over the window -----
  html+=`<h2 class="sec" style="margin-top:18px">Attendance</h2>`;
  const loggedDates=new Set(logs.map(l=>l.log_date));
  const att=[];
  for(let i=41;i>=0;i--){ const d=new Date(); d.setDate(d.getDate()-i); const iso=todayISO(d);
    att.push({date:iso, state:attendanceState(iso, loggedDates.has(iso)?1:0)}); }
  const attended=att.filter(a=>a.state==="attended").length;
  const missed=att.filter(a=>a.state==="missed").length;
  const scheduled=attended+missed;
  const rate=scheduled?Math.round(attended/scheduled*100):0;
  const rcls=rate>=75?"up":(rate>=40?"flat":"down");
  html+=`<div class="stat"><span class="k">Sessions attended</span>
    <span class="v">${attended} / ${scheduled}&ensp;<span class="pill ${rcls}">${rate}%</span></span></div>`;
  if(missed) html+=`<div class="stat"><span class="k">Missed sessions</span><span class="v pill down">${missed}×</span></div>`;
  html+=`<div class="attend-strip">`+att.map(a=>`<i class="attend-cell ${a.state}" title="${a.date} · ${a.state}"></i>`).join("")+`</div>`;
  html+=`<p class="lbl chartcap">last 42 days · <i class="attend-cell attended"></i> attended
    <i class="attend-cell missed"></i> missed <i class="attend-cell rest"></i> rest</p>`;

  // pain flags
  const pains=logs.filter(l=>l.pain);
  html+=`<h2 class="sec" style="margin-top:18px">Pain noted</h2>`;
  if(!pains.length) html+=`<div class="lbl">None flagged. Good.</div>`;
  else{ const cnt={}, lastPain={};
    pains.forEach(p=>{cnt[p.exercise]=(cnt[p.exercise]||0)+1;
      if(!lastPain[p.exercise]||p.log_date>lastPain[p.exercise]) lastPain[p.exercise]=p.log_date;});
    Object.entries(cnt).sort((a,b)=>b[1]-a[1]).forEach(([ex,n])=>{
      html+=`<div class="stat" data-day="${lastPain[ex]||""}" style="cursor:pointer"><span class="k">${PROGRAM_NAME(ex)||ex}</span><span class="v pill down">${n}×</span></div>`;});
  }

  // adherence: habits + sleep/cal/protein over the window
  html+=`<h2 class="sec" style="margin-top:18px">Practices</h2>`;
  const adh=habitAdherence(42);
  settings.habits.forEach(h=>{
    const pct=Math.round((adh[h.key]||0)*100);
    const cls=pct>=75?"up":(pct>=40?"flat":"down");
    html+=`<div class="stat"><span class="k">${h.label}</span><span class="v pill ${cls}">${pct}%</span></div>`;
  });

  // fun
  const funs=logs.filter(l=>l.fun).map(l=>l.fun);
  const funAvg=funs.length?(funs.reduce((a,b)=>a+b,0)/funs.length):null;

  // plain-language summary
  html+=brush()+`<h2 class="sec">Summary</h2>`;
  const strengths=moves.filter(m=>m.delta>1).slice(0,3).map(m=>PROGRAM_NAME(m.ex)||m.ex);
  const worst = pickWorst(moves,pains,adh,settings.habits);
  html+=`<p style="line-height:1.7">`;
  if(strengths.length) html+=`Climbing well: <strong>${strengths.join(", ")}</strong>. `;
  if(funAvg) html+=`Average enjoyment ${funAvg.toFixed(1)}/5. `;
  html+=`Biggest thing to fix: <strong>${worst}</strong>.`;
  html+=`</p>`;
  app.innerHTML=html;
  // dropdowns redraw only their own chart from the closure-held series
  const rsel=document.getElementById("ranksSel");
  rsel?.addEventListener("change",()=>{ document.getElementById("ranksChart").innerHTML=rankChart(rankSeries[rsel.value]||[]); });
  const ssel=document.getElementById("strSel");
  ssel?.addEventListener("change",()=>{ document.getElementById("strChart").innerHTML=strengthChart(byEx[ssel.value]||[]); });
  // pain rows open the underlying day
  app.querySelectorAll("[data-day]").forEach(el=>el.addEventListener("click",()=>{
    if(el.dataset.day) openDaySheet(el.dataset.day);
  }));
}

// best conservative 1RM across a row's sets, any rep bracket — used only for
// analytics so the trend populates before any heavy set is logged. Returns null
// when no set carries external load (bodyweight-only sets have no 1RM estimate).
function bestEst(sets){
  let best=null;
  for(const s of (sets||[])){
    if(s.weight>0 && s.reps>0){ const e=conservative1RM(s.weight,s.reps); if(best==null||e>best) best=e; }
  }
  return best;
}

// SVG line chart with numeric axes. pts: [{t:ms, v:number}] sorted by t.
// One point draws a dot, two+ a line. opts: {yMin,yMax,yTicks[],yFmt,color,empty}.
function lineChart(pts, opts){
  const {yMin,yMax,yTicks,yFmt=(v)=>Math.round(v),color="var(--jade)",empty="No data yet."}=opts;
  if(!pts.length) return `<div class="empty" style="padding:16px 0">${empty}</div>`;
  const W=340,H=176,mL=32,mR=8,mT=8,mB=22;
  const x0=mL,x1=W-mR,y0=H-mB,y1=mT;
  const tMin=pts[0].t,tMax=pts[pts.length-1].t,tSpan=(tMax-tMin)||1,vSpan=(yMax-yMin)||1;
  const X=t=>x0+((t-tMin)/tSpan)*(x1-x0);
  const Y=v=>y0-((v-yMin)/vSpan)*(y0-y1);
  let grid="",ylab="";
  yTicks.forEach(v=>{ const y=Y(v).toFixed(1);
    grid+=`<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" class="grid"/>`;
    ylab+=`<text x="${x0-5}" y="${y}" class="ytick">${yFmt(v)}</text>`; });
  const idxs=[...new Set(pts.length<=2?pts.map((_,i)=>i):[0,Math.floor((pts.length-1)/2),pts.length-1])];
  const last=pts.length-1;
  let xlab="";
  idxs.forEach(i=>{ const p=pts[i],x=X(p.t).toFixed(1),d=new Date(p.t);
    // keep the end labels inside the viewBox (middle-anchored ones overflow the edges)
    const anchor=i===0?"start":(i===last?"end":"middle");
    xlab+=`<text x="${x}" y="${H-6}" class="xtick" style="text-anchor:${anchor}">${d.getMonth()+1}/${d.getDate()}</text>`; });
  const axes=`<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y0}" class="axis"/>
    <line x1="${x0}" y1="${y1}" x2="${x0}" y2="${y0}" class="axis"/>`;
  let series;
  if(pts.length===1){
    series=`<circle cx="${X(pts[0].t).toFixed(1)}" cy="${Y(pts[0].v).toFixed(1)}" r="3.5" fill="${color}"/>`;
  } else {
    const line=pts.map(p=>`${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join(" ");
    series=`<polyline points="${line}" fill="none" stroke="${color}" stroke-width="2"
      stroke-linejoin="round" stroke-linecap="round"/>`+
      pts.map(p=>`<circle cx="${X(p.t).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="2.6" fill="${color}"/>`).join("");
  }
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${grid}${axes}${series}${ylab}${xlab}</svg>`;
}
// round a 0..max range up to tidy, evenly-spaced tick marks
function niceScale(max){
  const span=max||1, step0=span/4, mag=Math.pow(10,Math.floor(Math.log10(step0))), norm=step0/mag;
  const step=(norm<=1?1:norm<=2?2:norm<=5?5:10)*mag;
  const top=Math.ceil(max/step)*step||step, ticks=[];
  for(let v=0;v<=top+1e-9;v+=step) ticks.push(Math.round(v));
  return {top,ticks};
}
// ranks: fixed 0–24 tier axis, shared across all rank lifts
function rankChart(series){
  const pts=series.map(s=>({t:new Date(s.log_date+"T12:00:00").getTime(),v:s.tier}));
  return lineChart(pts,{yMin:0,yMax:24,yTicks:[0,6,12,18,24],yFmt:v=>v,color:"var(--cinnabar)",
    empty:"Log a heavy 4–6 rep set (with bodyweight) to chart this rank."});
}
// strength: est-1RM in lb, y rescaled to the selected lift
function strengthChart(series){
  const pts=series.map(s=>({t:new Date(s.log_date+"T12:00:00").getTime(),v:s.est}));
  const {top,ticks}=niceScale(pts.length?Math.max(...pts.map(p=>p.v)):1);
  return lineChart(pts,{yMin:0,yMax:top,yTicks:ticks,yFmt:v=>Math.round(v),color:"var(--jade)",
    empty:"No sets logged for this lift yet."});
}

function PROGRAM_NAME(key){
  // active program first (custom names), then the default so a since-removed
  // exercise still shows a readable name in old logs
  for(const src of [activeProgram().days, defaultProgram().days]){
    for(const day of Object.values(src)){ const f=day.exercises.find(e=>e.key===key); if(f) return f.name; }
  }
  return null;
}
function habitAdherence(days){
  const acc={},cnt={};
  for(let i=0;i<days;i++){ const d=new Date(); d.setDate(d.getDate()-i);
    const day=LS.get("day:"+todayISO(d),null); if(!day) continue;
    const done=day.habits_done||{};
    settings.habits.forEach(h=>{cnt[h.key]=(cnt[h.key]||0)+1; if(done[h.key])acc[h.key]=(acc[h.key]||0)+1;});
  }
  const out={}; settings.habits.forEach(h=>out[h.key]=cnt[h.key]?(acc[h.key]||0)/cnt[h.key]:0);
  return out;
}
function pickWorst(moves,pains,adh,habits){
  // priority: recurring pain > stalling rank lift > worst-adhered key habit
  if(pains.length){ const cnt={}; pains.forEach(p=>cnt[p.exercise]=(cnt[p.exercise]||0)+1);
    const top=Object.entries(cnt).sort((a,b)=>b[1]-a[1])[0]; if(top&&top[1]>=2) return `recurring pain in ${PROGRAM_NAME(top[0])||top[0]}`; }
  const stalls=moves.filter(m=>m.delta!=null && m.delta<=0); if(stalls.length) return `stalled ${PROGRAM_NAME(stalls[0].ex)||stalls[0].ex}`;
  let worstKey=null,worstV=2; habits.forEach(h=>{const v=adh[h.key]||0; if(v<worstV){worstV=v;worstKey=h.label;}});
  return worstKey?`consistency on "${worstKey}" (${Math.round(worstV*100)}%)`:"keep logging to reveal patterns";
}

async function syncSettings(){
  if(!(sb&&user)) return;
  try{
    const {error}=await sb.from("settings").upsert({user_id:user.id,...settings},{onConflict:"user_id"});
    // older databases may lack the `program` column; sync everything else so
    // the rest of settings still reaches the cloud until the migration is run
    if(error){ const {program,...rest}=settings; await sb.from("settings").upsert({user_id:user.id,...rest},{onConflict:"user_id"}); }
  }catch(e){/* offline: stays in local cache */}
}

// cinnabar seal pressed onto the page for a true 1RM PR (380ms per spec)
function sealPress(){
  const el=document.createElement("div"); el.className="pr-seal";
  el.innerHTML=`<span class="cjk">峰</span>`;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(), 2000);
}

// ---------- toast ----------
let toastT;
function toast(msg){ let el=document.getElementById("toast");
  if(!el){el=document.createElement("div");el.id="toast";el.className="toast";document.body.appendChild(el);}
  el.textContent=msg; el.classList.add("show"); clearTimeout(toastT);
  toastT=setTimeout(()=>el.classList.remove("show"),1800);
}

// ---------- tabs / routing ----------
function tabs(){
  const nav=document.createElement("nav"); nav.className="tabs";
  const items=[["today","山","Today"],["ranks","印","Seals"],["analytics","徑","Reflect"],["history","誌","History"],["settings","設","Settings"]];
  nav.innerHTML=items.map(([id,cjk,lbl])=>`<button data-tab="${id}" class="${id===activeTab?'active':''}">
    <span class="cjk">${cjk}</span><span>${lbl}</span></button>`).join("");
  nav.querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>go(b.dataset.tab)));
  return nav;
}
function mountTabs(){ document.querySelector("nav.tabs")?.remove(); document.body.appendChild(tabs()); }

async function go(tab){ activeTab=tab; mountTabs();
  if(tab==="today") await renderToday();
  else if(tab==="ranks") renderRanks();
  else if(tab==="analytics") await renderAnalytics();
  else if(tab==="history") await renderHistory();
  else if(tab==="settings") renderSettings();
  else if(tab==="program") renderProgramEditor();
  window.scrollTo({top:0,behavior:"smooth"});
}

function renderSettings(){
  let html=mast("Settings · 設");
  const wkNow=weekInfo(settings.program_start).weekNum;
  const isDeload=(settings.deload_weeks||[]).includes(wkNow);
  html+=`<div class="eyebrow">Program</div>
    <div class="daybar"><span class="lbl">start date</span>
      <input type="date" id="pstart" value="${settings.program_start}"></div>
    <div class="daybar"><span class="lbl">deload this week</span>
      <span class="dot ${isDeload?'on':''}" id="deloadDot" title="tag this week as deload"></span>
      <span class="lbl" style="font-style:italic">excluded from strength trends</span></div>
    <div style="margin-top:10px"><button class="ghost" id="editProgram">Edit exercises &amp; schedule →</button></div>`;
  html+=brush()+`<div class="eyebrow">Daily practices (editable)</div>`;
  html+=settings.habits.map((h,i)=>`<div class="daybar">
    <input class="hlabel" data-i="${i}" value="${h.label}" style="flex:1;font-family:inherit">
    <button class="ghost hdel" data-i="${i}" aria-label="remove practice">✕</button>
    </div>`).join("");
  html+=`<div style="margin-top:10px"><button class="ghost" id="addHabit">Add practice</button></div>`;
  html+=brush()+`<div class="eyebrow">Backup</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="ghost" id="export">Export data</button>
    <button class="ghost" id="importBtn">Import data</button>
    <input type="file" id="importFile" accept="application/json,.json" hidden>
    <button class="ghost" id="signout">Sign out</button></div>`;
  html+=`<p class="lbl" style="margin-top:18px">${user?`Signed in as ${user.email}. Data syncs to your private Supabase.`:`Offline mode — data is on this device. Add Supabase keys to sync.`}</p>`;
  app.innerHTML=html;
  document.getElementById("pstart").addEventListener("change",e=>{settings.program_start=e.target.value;LS.set("settings",settings);syncSettings();});
  document.getElementById("editProgram").addEventListener("click",()=>go("program"));
  document.getElementById("deloadDot").addEventListener("click",e=>{
    const wk=weekInfo(settings.program_start).weekNum;
    const set=new Set(settings.deload_weeks||[]);
    set.has(wk) ? set.delete(wk) : set.add(wk);
    settings.deload_weeks=[...set].sort((a,b)=>a-b);
    LS.set("settings",settings); syncSettings();
    e.target.classList.toggle("on");
  });
  app.querySelectorAll(".hlabel").forEach(inp=>inp.addEventListener("change",()=>{
    settings.habits[+inp.dataset.i].label=inp.value; LS.set("settings",settings); syncSettings();}));
  app.querySelectorAll(".hdel").forEach(b=>b.addEventListener("click",()=>{
    // removed keys stay in past days' habits_done; they're simply no longer rendered
    settings.habits.splice(+b.dataset.i,1);
    LS.set("settings",settings); syncSettings(); renderSettings();
  }));
  document.getElementById("addHabit").addEventListener("click",()=>{
    settings.habits.push({key:"h"+Date.now(),label:"New practice"}); LS.set("settings",settings); renderSettings();});
  document.getElementById("export").addEventListener("click",exportData);
  document.getElementById("importBtn").addEventListener("click",()=>document.getElementById("importFile").click());
  document.getElementById("importFile").addEventListener("change",e=>{ if(e.target.files[0]) importData(e.target.files[0]); });
  document.getElementById("signout").addEventListener("click",async()=>{ if(sb)await sb.auth.signOut(); await clearLocalData(); location.reload(); });
}

// ---------- program editor (編): edit exercises, order, and day structure ----------
const WEEKDAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const FAMILIES = ["push","pull","legs","core","other"];
// escape user text before dropping it into an HTML attribute
function escAttr(s){ return String(s??"").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;"); }

// materialise settings.program (from the default) on first edit, apply the
// change, persist, and optionally re-render. Field edits pass rerender=false so
// the input keeps focus while typing; structural edits re-render.
function progEdit(fn, rerender=true){
  if(!settings.program) settings.program = defaultProgram();
  fn(settings.program);
  LS.set("settings",settings); syncSettings();
  if(rerender) renderProgramEditor();
}
function moveExercise(dayId,i,dir){
  progEdit(p=>{ const arr=p.days[dayId].exercises, j=i+dir;
    if(j<0||j>=arr.length) return; [arr[i],arr[j]]=[arr[j],arr[i]]; });
}

function renderProgramEditor(){
  const p=activeProgram();
  const dayIds=Object.keys(p.days);
  let html=mast("Program · 編");
  html+=`<p class="lbl" style="margin:2px 0 8px">Rearrange your split, exercises, and their order. Changes apply to future logging; past entries keep their own record.</p>`+brush();

  html+=`<div class="eyebrow">Weekly schedule</div>`;
  WEEKDAYS.forEach((name,wd)=>{
    const sel=p.schedule[wd]||"rest";
    html+=`<div class="daybar"><span class="lbl" style="flex:1">${name}</span>
      <select class="exsel sch" data-wd="${wd}" style="flex:0 0 55%">
        <option value="rest" ${sel==="rest"?"selected":""}>Rest</option>
        ${dayIds.map(id=>`<option value="${id}" ${sel===id?"selected":""}>${escAttr(p.days[id].title)}</option>`).join("")}
      </select></div>`;
  });

  html+=brush()+`<div class="eyebrow">Days</div>`;
  dayIds.forEach(id=>{
    const day=p.days[id];
    html+=`<div class="progday">
      <div class="daybar">
        <input class="txtin dtitle" data-day="${id}" value="${escAttr(day.title)}" style="flex:1;font-weight:600">
        <select class="exsel dfam" data-day="${id}" style="flex:0 0 28%">
          ${FAMILIES.map(f=>`<option value="${f}" ${day.family===f?"selected":""}>${f}</option>`).join("")}
        </select>
        <button class="ghost ddel" data-day="${id}" aria-label="delete day">✕</button>
      </div>`;
    day.exercises.forEach((ex,i)=>{
      html+=`<div class="exrow">
        <span class="exmove">
          <button class="ghost mup" data-day="${id}" data-i="${i}" aria-label="move up" ${i===0?"disabled":""}>▲</button>
          <button class="ghost mdn" data-day="${id}" data-i="${i}" aria-label="move down" ${i===day.exercises.length-1?"disabled":""}>▼</button>
        </span>
        <input class="txtin exname" data-day="${id}" data-i="${i}" value="${escAttr(ex.name)}" style="flex:1">
        ${ex.rank?`<span class="rankbadge" title="ranked lift">rank</span>`:""}
        <input class="txtin exsets mono" data-day="${id}" data-i="${i}" inputmode="numeric" value="${ex.sets||3}" aria-label="target sets">
        <span class="unit">sets</span>
        <button class="ghost exdel" data-day="${id}" data-i="${i}" aria-label="remove exercise">✕</button>
      </div>`;
    });
    if(!day.exercises.length) html+=`<p class="lbl" style="padding:6px 0">No exercises yet.</p>`;
    html+=`<div style="margin:8px 0 2px"><button class="ghost exadd" data-day="${id}">Add exercise</button></div></div>`;
  });

  html+=`<div style="margin-top:10px"><button class="ghost" id="addDay">Add day</button></div>`+brush();
  html+=`<div style="display:flex;gap:10px;flex-wrap:wrap">
    <button class="act" id="progDone">Done</button>
    <button class="ghost" id="progReset">Reset to default</button></div>`;
  app.innerHTML=html;
  wireProgramEditor();
}

function wireProgramEditor(){
  // schedule / family (structural: re-render so schedule labels stay in sync)
  app.querySelectorAll(".sch").forEach(s=>s.addEventListener("change",()=>
    progEdit(p=>{ p.schedule[+s.dataset.wd]=s.value; })));
  app.querySelectorAll(".dfam").forEach(s=>s.addEventListener("change",()=>
    progEdit(p=>{ p.days[s.dataset.day].family=s.value; }, false)));
  // text fields: persist without re-render to keep the caret
  app.querySelectorAll(".dtitle").forEach(inp=>inp.addEventListener("change",()=>
    progEdit(p=>{ p.days[inp.dataset.day].title=inp.value.trim()||"Untitled"; }, false)));
  app.querySelectorAll(".exname").forEach(inp=>inp.addEventListener("change",()=>
    progEdit(p=>{ p.days[inp.dataset.day].exercises[+inp.dataset.i].name=inp.value.trim()||"Exercise"; }, false)));
  app.querySelectorAll(".exsets").forEach(inp=>inp.addEventListener("change",()=>
    progEdit(p=>{ p.days[inp.dataset.day].exercises[+inp.dataset.i].sets=Math.max(1,Math.min(10,parseInt(inp.value)||3)); }, false)));
  // reorder
  app.querySelectorAll(".mup").forEach(b=>b.addEventListener("click",()=>moveExercise(b.dataset.day,+b.dataset.i,-1)));
  app.querySelectorAll(".mdn").forEach(b=>b.addEventListener("click",()=>moveExercise(b.dataset.day,+b.dataset.i,1)));
  // delete exercise (warn for rank lifts, whose standards can't be regenerated)
  app.querySelectorAll(".exdel").forEach(b=>b.addEventListener("click",()=>{
    const ex=activeProgram().days[b.dataset.day].exercises[+b.dataset.i];
    if(ex.rank && !confirm(`${ex.name} is a ranked lift — removing it means it won't rank. Remove anyway?`)) return;
    progEdit(p=>{ p.days[b.dataset.day].exercises.splice(+b.dataset.i,1); });
  }));
  app.querySelectorAll(".exadd").forEach(b=>b.addEventListener("click",()=>
    progEdit(p=>{ p.days[b.dataset.day].exercises.push({key:"x"+Date.now(),name:"New exercise",sets:3}); })));
  // day add/delete
  document.getElementById("addDay").addEventListener("click",()=>
    progEdit(p=>{ p.days["day"+Date.now()]={title:"New day",family:"other",exercises:[]}; }));
  app.querySelectorAll(".ddel").forEach(b=>b.addEventListener("click",()=>{
    const id=b.dataset.day;
    if(!confirm(`Delete "${activeProgram().days[id].title}" and its exercises?`)) return;
    progEdit(p=>{ delete p.days[id];
      for(const wd of Object.keys(p.schedule)) if(p.schedule[wd]===id) p.schedule[wd]="rest"; });
  }));
  // done / reset
  document.getElementById("progDone").addEventListener("click",()=>go("settings"));
  document.getElementById("progReset").addEventListener("click",()=>{
    if(!confirm("Reset the whole program to the default 6-day split? Your custom exercises and schedule will be removed.")) return;
    delete settings.program; LS.set("settings",settings); syncSettings(); renderProgramEditor();
  });
}

function exportData(){
  const dump={settings, days:{}, work:{}, ranks:{}};
  for(let i=0;i<400;i++){const d=new Date();d.setDate(d.getDate()-i);const k=todayISO(d);
    const day=LS.get("day:"+k,null),w=LS.get("work:"+k,null);
    if(day)dump.days[k]=day; if(w)dump.work[k]=w;}
  ["bench","squat","rdl","db_shoulder_press"].forEach(k=>dump.ranks[k]=LS.get("rank:"+k,null));
  const blob=new Blob([JSON.stringify(dump,null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`shan-backup-${todayISO()}.json`;a.click();
}

// restore a shan-backup-*.json produced by exportData
async function importData(file){
  let dump;
  try{ dump = JSON.parse(await file.text()); }
  catch(e){ toast("Not a readable backup file"); return; }
  if(!dump || typeof dump!=="object" || typeof dump.settings!=="object"
     || typeof dump.days!=="object" || typeof dump.work!=="object"){
    toast("Not a Shan backup"); return;
  }
  const n = Object.keys(dump.days).length + Object.keys(dump.work).length;
  if(!confirm(`Restore ${n} day records from this backup? Matching local data will be overwritten.`)) return;
  settings = dump.settings; LS.set("settings", settings);
  for(const [k,v] of Object.entries(dump.days)) LS.set("day:"+k, v);
  for(const [k,v] of Object.entries(dump.work)) LS.set("work:"+k, v);
  for(const [k,v] of Object.entries(dump.ranks||{})) if(v) LS.set("rank:"+k, v);
  if(sb&&user){ try{
    await syncSettings();
    for(const v of Object.values(dump.days))
      await sb.from("daily_logs").upsert({...v,user_id:user.id},{onConflict:"user_id,log_date"});
    for(const rows of Object.values(dump.work)) for(const r of rows||[])
      await sb.from("workout_logs").upsert({...r,user_id:user.id},{onConflict:"user_id,log_date,exercise"});
    for(const [k,v] of Object.entries(dump.ranks||{})) if(v)
      await sb.from("ranks").upsert({user_id:user.id,exercise:k,...v},{onConflict:"user_id,exercise"});
  }catch(e){ toast("Restored on this device · cloud sync incomplete"); renderSettings(); return; } }
  toast("Backup restored");
  renderSettings();
}

// ---------- auth gate ----------
async function renderAuth(mode="signin"){
  const signup = mode==="signup";
  const inputStyle="width:100%;padding:12px;margin:6px 0;border:1px solid rgba(138,137,124,.4);border-radius:4px;font-family:inherit;background:var(--paper-hi)";
  app.innerHTML=mast("")+`
    <div style="max-width:22rem;margin:8vh auto 0;text-align:center">
      <div class="display" style="font-size:56px;color:var(--jade)">山</div>
      <h2 class="sec">Shan</h2>
      <p class="lbl">${signup?"Create your account.":"A training journal."}</p>
      ${brush()}
      <input id="email" placeholder="email" autocomplete="email" style="${inputStyle}">
      <input id="pw" type="password" placeholder="password" autocomplete="${signup?"new-password":"current-password"}" style="${inputStyle}">
      <button class="act" id="submit" style="width:100%;margin-top:8px">${signup?"Create account":"Enter"}</button>
      <p class="lbl" id="authmsg" style="margin-top:10px"></p>
      <p class="lbl" style="margin-top:16px"><a href="#" id="toggleMode" style="color:var(--jade)">${signup?"Have an account? Sign in":"New here? Create an account"}</a></p>
      <p class="lbl" style="margin-top:14px"><a href="#" id="offline" style="color:var(--jade)">Use offline on this device</a></p>
    </div>`;
  document.querySelector("nav.tabs")?.remove();
  const msg=()=>document.getElementById("authmsg");
  const creds=()=>({email:document.getElementById("email").value.trim(), pw:document.getElementById("pw").value});

  document.getElementById("submit").addEventListener("click",async()=>{
    const {email,pw}=creds();
    if(!email){ msg().textContent="Enter your email."; return; }
    if(signup && pw.length<6){ msg().textContent="Password must be at least 6 characters."; return; }
    msg().textContent="…";
    if(signup){
      const {data,error}=await sb.auth.signUp({email,password:pw});
      if(error){ msg().textContent=error.message; return; }
      // if email confirmation is on, no session comes back — ask them to confirm
      if(data.session) location.reload();
      else { renderAuth("signin"); document.getElementById("authmsg").textContent="Account created — check your email to confirm, then sign in."; }
    } else {
      const {error}=await sb.auth.signInWithPassword({email,password:pw});
      if(error){ msg().textContent=error.message; } else location.reload();
    }
  });
  document.getElementById("toggleMode").addEventListener("click",e=>{ e.preventDefault(); renderAuth(signup?"signin":"signup"); });
  document.getElementById("offline").addEventListener("click",e=>{e.preventDefault();startApp(true);});
}

// Wipe this device's local caches. Local keys ("shan:*") and the photo
// IndexedDB are not namespaced by account, so they must be cleared when signing
// out or switching users — otherwise a shared browser would show the previous
// account's cached logs and photos.
async function clearLocalData(){
  for(const k of Object.keys(localStorage)) if(k.startsWith("shan:")) localStorage.removeItem(k);
  try{ photoDB._db?.close(); photoDB._db=null;
    await new Promise(res=>{ const q=indexedDB.deleteDatabase("shan-photos"); q.onsuccess=q.onerror=q.onblocked=()=>res(); });
  }catch(e){/* best effort */}
}

// ---------- boot ----------
async function startApp(offline){
  mountTabs(); await go("today");
  window.addEventListener("online",flushPending); flushPending();
}
(async function boot(){
  try{ await migratePhotos(); }catch(e){ console.warn("photo migration skipped", e); }
  try{ await initSupabase(); }catch(e){}
  // identity guard: if a different account is signing in, wipe the previous
  // account's local cache before we hydrate this one (shared-device safety).
  if(sb&&user && LS.get("uid",null)!==user.id){ await clearLocalData(); LS.set("uid", user.id); }
  // hydrate settings from supabase if available
  if(sb&&user){ try{ const {data}=await sb.from("settings").select("*").eq("user_id",user.id).maybeSingle();
    if(data){settings=data;LS.set("settings",settings);} else { await syncSettings(); } }catch(e){} }
  // hydrate ranks too — seals render from localStorage, which a new browser,
  // private window, or the installed PWA won't share with past sessions
  if(sb&&user){ try{ const {data:rk}=await sb.from("ranks").select("*").eq("user_id",user.id);
    for(const r of rk||[]) LS.set("rank:"+r.exercise, {current_tier:r.current_tier,current_1rm:r.current_1rm,
      current_ratio:r.current_ratio,peak_tier:r.peak_tier,peak_1rm:r.peak_1rm,peak_date:r.peak_date});
  }catch(e){} }
  if(sb && !user){ await renderAuth(); }
  else { await startApp(!sb); }
})();
