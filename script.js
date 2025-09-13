// === Calculator & Optimizer Logic ===

// Base attack speed tables
const baseOriginal={"Berserker":2.0,"Paladin":2.4,"Ranger":1.8,"Sorcerer":2.2};
const basePrimal={"Berserker":2.0,"Paladin":2.4,"Ranger":1.8,"Sorcerer":2.2};
const basePvP={"Berserker":2.2,"Paladin":2.5,"Ranger":2.0,"Sorcerer":2.3};
const base={"Original":baseOriginal,"Primal":basePrimal,"Chaos":baseOriginal,"Abyss":basePrimal,"PVP/Boss":basePvP};

const TARGET_FINAL=0.25;
const SET_VAL={Abyss:0.16,Chaos:0.14,Original:0.12,Primal:0.12};
const MAX_EQUIP_PIECES=8;

// Elements
const els=(ids=>ids.reduce((o,id)=>(o[id]=document.getElementById(id),o),{}))(
  ["cls","weap","char","col","guild","secret","equip","rune","quicken","fury","pet",
   "progressFill","progressText","requiredBox","finalBox","furyBtn","pbar",
   "bestLine","bestWaste","altList","applyBest","optSet"]
);

// Wire segmented controls
function wireSeg(segId, selectEl){
  const seg=document.getElementById(segId);
  seg?.addEventListener('click', e=>{
    const btn=e.target.closest('button');
    if(!btn) return;
    seg.querySelectorAll('button').forEach(b=>b.classList.remove('is-active'));
    btn.classList.add('is-active');
    selectEl.value=btn.dataset.val;
    recalc();
  });
}
wireSeg('classSeg', els.cls);
wireSeg('weaponSeg', document.getElementById('weap'));
wireSeg('optSetSeg', els.optSet);
// Initialize hidden selects from the default "is-active" segmented buttons
function initFromSeg(segId, selectEl){
  const active = document.querySelector(`#${segId} button.is-active`);
  if (active && selectEl) selectEl.value = active.dataset.val;
}

// Call once on load so recalc() has real values
function initDefaults(){
  initFromSeg('classSeg', els.cls);        // e.g. Sorcerer
  initFromSeg('weaponSeg', els.weap);      // e.g. Original
  initFromSeg('optSetSeg', els.optSet);    // e.g. Abyss
}
// Fury toggle
const furyRow=document.getElementById("furyRow");
document.getElementById('furyBtn')?.addEventListener('click', ()=>{
  const btn=document.getElementById('furyBtn');
  const on=btn.getAttribute('data-on')==='1';
  btn.setAttribute('data-on', on?'0':'1');
  els.fury.checked=!on;
  btn.textContent=els.fury.checked?'On':'Off';
  btn.classList.toggle('is-active', els.fury.checked);
  recalc();
});

// Helpers
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const pctInput=id=>(parseFloat(els[id].value||0)/100);

// Map select keys (from i18n.js) to numeric percentages
const KEY_TO_PCT = {
  char:   { none:0, heroic:0.07, swift:0.10 },
  col:    { normal:0, blue:0.10, orange:0.20, purple:0.30 },
  pet:    { petNone:0, petB:0.06, petA:0.09, petS:0.12 },
  quicken:{ qNone:0, q1:0.01, q2:0.02, q3:0.03, q4:0.04, q5:0.05 }
};

function pctSelect(id){
  const v = (els[id].value || "").trim();
  // If numeric string, just use it
  const num = Number(v);
  if (!Number.isNaN(num)) return num / 100;
  // Otherwise map key to percentage
  const m = KEY_TO_PCT[id] || {};
  return m[v] ?? 0;
}

const fmtPct=f=>(f*100).toFixed(2)+'%';

const applyTheme=()=>{
  const b=document.body;
  b.classList.remove('theme-Abyss','theme-Chaos','theme-Original','theme-Primal');
  b.classList.add('theme-'+els.optSet.value);
};
function currentState(includeEquipRune=true){
  const cls=els.cls.value, weap=els.weap.value, baseSpd=base[weap][cls];
  const char=pctSelect('char'), color=pctSelect('col'), guild=pctInput('guild'), secret=pctInput('secret');
  const equip=includeEquipRune ? pctInput('equip') : 0;
  const rune =includeEquipRune ? pctInput('rune')  : 0;
  const petPct=pctSelect('pet');
  const quick =pctSelect('quicken');   // <-- change was here
  const fury=(els.fury.checked && cls==='Berserker') ? 0.25 : 1.0;

  const buffsBase=char+color+guild+secret;
  const buffsAll=buffsBase+equip+rune+petPct;
  const denom=Math.max(baseSpd*(1-quick)*fury,1e-9);
  const requiredTotal=1-(TARGET_FINAL/denom);
  const requiredRemaining=Math.max(0, requiredTotal-buffsAll);
  const finalRaw=baseSpd*(1-buffsAll)*(1-quick)*fury;
  const finalSpd=Math.max(finalRaw, TARGET_FINAL);
  return {cls,weap,baseSpd,char,color,guild,secret,equip,rune,petPct,quick,fury,buffsBase,buffsAll,requiredTotal,requiredRemaining,finalSpd};
}
// Optimizer with Quicken restriction (≤ Lv.2)
function planCombos(){
  const s=currentState(false);
  const chosen=els.optSet.value;
  const pieceVal=SET_VAL[chosen];
  if(!pieceVal) return [];
  const denom0=Math.max(s.baseSpd*(1-0)*s.fury,1e-9);
  const requiredTotal0=1-(TARGET_FINAL/denom0);
  const need=Math.max(0, requiredTotal0 - s.buffsBase);
  const pets=[{name:'S',v:0.12},{name:'A',v:0.09},{name:'B',v:0.06},{name:'None',v:0.00}];
  const results=[];
  for(let pieces=0; pieces<=MAX_EQUIP_PIECES; pieces++){
    const equipPct=pieces*pieceVal;
    for(let qLevel=0; qLevel<=2; qLevel++){ // Restriction here
      const q=qLevel/100;
      for(let runePct=0.06; runePct>=-1e-9; runePct-=0.01){
        const rFix=Math.max(0,runePct);
        for(const pet of pets){
          const coverage=equipPct + rFix + pet.v + q;
          if(coverage + 1e-9 >= need){
            const waste=coverage-need;
            results.push({set:chosen,quickLevel:qLevel,pieces,equipPct,rune:Math.round(rFix*100),pet:pet.name,petV:pet.v,total:coverage,waste});
            break;
          }
        }
      }
    }
  }
  results.sort((a,b)=>(a.pieces-b.pieces)||(a.quickLevel-b.quickLevel)||(b.rune-a.rune)||(b.petV-a.petV)||(a.waste-b.waste));
  const uniq=[], seen=new Set();
  for(const r of results){
    const k=`${r.set}|${r.quickLevel}|${r.pieces}|${r.rune}|${r.pet}`;
    if(!seen.has(k)){
      uniq.push(r); seen.add(k);
    }
    if(uniq.length>=7) break;
  }
  return uniq;
}

const lineOf=r=>`${r.set}: ${r.pieces} piece${r.pieces===1?'':'s'} (${(r.equipPct*100).toFixed(2)}%)  |  Rune ${r.rune}%  |  Pet ${r.pet}  |  Quicken Lv.${r.quickLevel}`;
let lastBest=null;

function recalc(){
  applyTheme();
  const s=currentState(true);
  if (s.cls==='Berserker'){furyRow?.classList.remove('hidden');}
  else {
    furyRow?.classList.add('hidden');
    els.fury.checked=false;
    const b=document.getElementById('furyBtn');
    if(b){b.setAttribute('data-on','0'); b.classList.remove('is-active'); b.textContent='Off';}
  }
  const progress=s.requiredTotal<=0?1:clamp((s.buffsAll)/s.requiredTotal,0,1);
  document.getElementById('progressFill').style.width=(progress*100).toFixed(1)+'%';
  const pbar=document.getElementById('pbar');
  pbar.classList.remove('good','warn','hit');
  if(progress>=1){pbar.classList.add('good','hit');}
  else if(progress>=0.9){pbar.classList.add('warn');}
  document.getElementById('progressText').textContent=`Progress: ${(progress*100).toFixed(1)}% of required covered`;
  els.requiredBox.value=(s.requiredRemaining*100).toFixed(2);
  els.finalBox.value=s.finalSpd.toFixed(2);
  let plans=[];
  try{plans=planCombos();}catch(e){console.error(e); plans=[];}
  if(plans.length){
    lastBest=plans[0];
    els.bestLine.textContent=lineOf(lastBest)+`  → covers ${(lastBest.total*100).toFixed(2)}%`;
    els.bestWaste.textContent=`Waste overlap: ${(lastBest.waste*100).toFixed(2)}%`;
    els.altList.innerHTML=plans.slice(1,3).map(r=>`<li>${lineOf(r)} — waste ${(r.waste*100).toFixed(2)}%</li>`).join('');
  } else {
    lastBest=null;
    els.bestLine.textContent='No valid combo with Quicken ≤ Lv.2.';
    els.bestWaste.textContent='—';
    els.altList.innerHTML='';
  }
}

function applyOptimal(){
  if(!lastBest){
    alert('No optimal combo found yet.');
    return;
  }

  // Numeric fields can stay as-is
  els.equip.value = (lastBest.equipPct * 100).toFixed(2);
  els.rune.value  = String(lastBest.rune);

  // Map optimizer pet names to select keys
  const petKeyMap = {
    None: 'petNone',
    B:    'petB',
    A:    'petA',
    S:    'petS'
  };
  els.pet.value = petKeyMap[lastBest.pet] || 'petNone';

  // Map optimizer quickLevel (0–2) to select keys
  els.quicken.value = lastBest.quickLevel === 0
    ? 'qNone'
    : `q${lastBest.quickLevel}`;

  recalc();
}
els.applyBest?.addEventListener('click', applyOptimal);

// Input focus helpers
function isEditableNumber(el){return el.tagName==='INPUT'&&el.type==='number'&&!el.readOnly}
document.addEventListener('focusin', e=>{
  const el=e.target;
  if(!isEditableNumber(el))return;
  const v=(el.value||'').trim();
  if(v===''||Number(v)===0) el.value='';
  el.select();
});
document.addEventListener('focusout', e=>{
  const el=e.target;
  if(!isEditableNumber(el))return;
  if((el.value||'').trim()===''){ el.value='0'; recalc(); }
});
['input','change','click'].forEach(evt=>
  document.addEventListener(evt, e=>{ if(e.target.matches('input, select, button')) recalc(); })
);

// Initial calc
document.addEventListener("DOMContentLoaded", () => {
  initDefaults();
  recalc();
});
