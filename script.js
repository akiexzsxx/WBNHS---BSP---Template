(()=>{"use strict";
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const DB_NAME="wbnhs-bsp-template",DB_VERSION=1,MAX_PHOTOS=100;
const OFFICIAL_PROFILE_ID="wbnhs-bsp-official-default";
const OFFICIAL_TEMPLATE_PATHS={landscape:"./landscape.png",portrait:"./portrait.png"};
let db,profiles=[],photos=[],activeProfileId=null,editingProfile=null,profileIsNew=false,editingSlot=null,editorPhotoId=null,editorDraft=null,editorStart=null,history=[],historyIndex=-1,bulkIds=[],exportQueue=[],exportCancelled=false,toastTimer;
const defaults={format:"png",quality:1,prefix:"WBNHS",suffix:"BSP",separator:"_",start:1,padding:3,includeOriginal:"no"};
let exportPrefs={...defaults};
const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);
const clone=o=>typeof structuredClone==="function"?structuredClone(o):o;
const toast=m=>{const t=$("#toast");t.textContent=m;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),3000)};
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains("profiles"))d.createObjectStore("profiles",{keyPath:"id"});if(!d.objectStoreNames.contains("photos"))d.createObjectStore("photos",{keyPath:"id"});if(!d.objectStoreNames.contains("meta"))d.createObjectStore("meta",{keyPath:"key"});};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function tx(store,mode="readonly"){return db.transaction(store,mode).objectStore(store)}
function req(r){return new Promise((res,rej)=>{r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function put(store,obj){await req(tx(store,"readwrite").put(obj))}
async function del(store,key){await req(tx(store,"readwrite").delete(key))}
async function all(store){return req(tx(store).getAll())}
async function getMeta(key){return req(tx("meta").get(key))}
async function setMeta(key,value){await put("meta",{key,value})}
const profileById=id=>profiles.find(p=>p.id===id);
const photoById=id=>photos.find(p=>p.id===id);
const selected=()=>photos.filter(p=>p.selected);
function settings(){return{zoom:1,x:0,y:0,rotation:0}}
function orientation(w,h){return w>h?"landscape":"portrait"}
function theme(t){document.documentElement.dataset.theme=t;localStorage.setItem("wb-theme",t);$("#themeBtn").textContent=t==="dark"?"☼":"☾"}
function templateFor(photo){const p=profileById(photo.profileId);return p?.[photo.orientation]||null}
function dataURL(blob){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(blob)})}
async function decode(blob){
  if(!blob) throw new Error("Image data is missing from browser storage. Re-import this photograph or template.");
  if(typeof createImageBitmap==="function"){
    try{return await createImageBitmap(blob,{imageOrientation:"from-image"});}
    catch(firstError){
      try{return await createImageBitmap(blob);}
      catch(secondError){console.warn("ImageBitmap decoding failed; trying HTMLImageElement fallback.",firstError,secondError);}
    }
  }
  return await new Promise((resolve,reject)=>{
    let url;
    try{url=URL.createObjectURL(blob);}catch(err){reject(new Error("Stored image data is not a readable Blob: "+(err?.message||String(err))));return;}
    const img=new Image();
    img.onload=()=>{URL.revokeObjectURL(url);if(!img.naturalWidth||!img.naturalHeight){reject(new Error("The image decoded without valid dimensions."));return;}resolve(img);};
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("The browser could not decode this stored image. Re-import the original file and try again."));};
    img.src=url;
  });
}
async function ensureOfficialProfile(){
  const existing=await req(tx("profiles").get(OFFICIAL_PROFILE_ID));
  if(existing)return existing;
  async function loadBundledPNG(path,label){
    const response=await fetch(path,{cache:"no-cache"});
    if(!response.ok)throw new Error(`Could not load the built-in ${label} template (${response.status}). Make sure ${path} is in the repository root.`);
    const blob=await response.blob();
    const signature=new Uint8Array(await blob.slice(0,8).arrayBuffer());
    const pngSignature=[137,80,78,71,13,10,26,10];
    if(!pngSignature.every((value,index)=>value===signature[index])){
      throw new Error(`The built-in ${label} template is not a valid PNG: ${path}`);
    }
    const bitmap=await decode(blob);
    const template={blob,width:bitmap.width,height:bitmap.height};
    bitmap.close?.();
    return template;
  }
  const [landscape,portrait]=await Promise.all([
    loadBundledPNG(OFFICIAL_TEMPLATE_PATHS.landscape,"landscape"),
    loadBundledPNG(OFFICIAL_TEMPLATE_PATHS.portrait,"portrait")
  ]);
  const profile={
    id:OFFICIAL_PROFILE_ID,
    name:"WBNHS – BSP Official Template",
    created:Date.now(),
    modified:Date.now(),
    landscape,
    portrait,
    builtIn:true
  };
  await put("profiles",profile);
  return profile;
}
async function savePhoto(p){p.updated=Date.now();await put("photos",p)}
async function saveWorkspace(){await setMeta("workspace",{ids:photos.map(p=>p.id),order:photos.map(p=>p.id),savedAt:Date.now()})}
function render(){
const grid=$("#photoGrid");grid.innerHTML="";grid.classList.toggle("list",$("#viewMode").value==="list");
photos.forEach(p=>{
const card=document.createElement("article");card.className="photo-card"+(p.selected?" selected":"");
const img=document.createElement("img");img.alt="";img.src=p.thumb||"";
const thumb=document.createElement("div");thumb.className="photo-thumb";
if(p.thumb)thumb.append(img);else thumb.innerHTML='<span class="broken">Preview unavailable</span>';
const check=document.createElement("input");check.type="checkbox";check.className="photo-check";check.checked=!!p.selected;check.setAttribute("aria-label","Select "+p.name);check.onchange=()=>{p.selected=check.checked;savePhoto(p);render()};thumb.append(check);
const info=document.createElement("div");info.className="photo-info";
const name=document.createElement("div");name.className="photo-name";name.textContent=p.name;
const meta=document.createElement("div");meta.className="photo-meta";meta.textContent=`${p.orientation} · ${profileById(p.profileId)?.name||"Missing profile"} · ${p.applied?"Applied":"Unedited"}`;info.append(name,meta);
const actions=document.createElement("div");actions.className="photo-actions";
[["Edit",()=>openEditor(p.id)],["Rename",()=>renamePhoto(p)],["Export",()=>beginExport([p.id])],["Remove",()=>removePhoto(p.id)]].forEach(([label,fn])=>{const b=document.createElement("button");b.className="btn compact";b.textContent=label;b.onclick=fn;actions.append(b)});
card.append(thumb,info,actions);grid.append(card)});
$("#emptyState").classList.toggle("hidden",photos.length>0);grid.classList.toggle("hidden",photos.length===0);$("#selectionTools").classList.toggle("hidden",photos.length===0);
$("#totalCount").textContent=photos.length;$("#readyCount").textContent=photos.filter(p=>p.applied&&templateFor(p)).length;$("#pendingCount").textContent=photos.filter(p=>!p.applied).length;$("#failedCount").textContent=photos.filter(p=>p.failed).length;$("#selectedCount").textContent=selected().length;$("#selectedActionCount").textContent=selected().length;$("#activeProfileLabel").textContent=profileById(activeProfileId)?.name||"No profile selected";$("#workspaceHint").textContent=photos.length?`${photos.length} item${photos.length===1?"":"s"} · ${selected().length} selected`:"Import images to begin.";$("#exportSelectedBtn").disabled=!selected().length
}
function renderProfiles(){
const list=$("#profileList");list.innerHTML="";
profiles.forEach(p=>{
const row=document.createElement("div");row.className="profile-item"+(p.id===activeProfileId?" active":"");
const info=document.createElement("div");info.innerHTML=`<strong></strong><small></small>`;
info.querySelector("strong").textContent=p.name;
info.querySelector("small").textContent=`Landscape: ${p.landscape?`${p.landscape.width}×${p.landscape.height}`:"missing"} · Portrait: ${p.portrait?`${p.portrait.width}×${p.portrait.height}`:"missing"}`;
const actions=document.createElement("div");actions.className="profile-actions";
const edit=document.createElement("button");edit.className="btn compact";edit.textContent="Edit";edit.onclick=()=>editProfile(p.id);
const activate=document.createElement("button");activate.className="btn compact";activate.textContent=p.id===activeProfileId?"Active":"Use";activate.onclick=()=>switchProfile(p.id);
const remove=document.createElement("button");remove.className="text-btn danger-text";remove.textContent="Delete";remove.onclick=()=>deleteProfile(p.id);
if(p.id===OFFICIAL_PROFILE_ID){remove.disabled=true;remove.title="Built-in official profile cannot be deleted";}
actions.append(edit,activate,remove);row.append(info,actions);list.append(row)});
$("#profileSource").innerHTML='<option value="empty">Empty profile</option>'+profiles.map(p=>`<option value="${p.id}">${escapeHTML(p.name)}</option>`).join("")
}
function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function openSettings(tab="profiles"){$("#settingsBackdrop").classList.remove("hidden");switchTab(tab);renderProfiles();storageInfo()}
function switchTab(name){$$(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===name));$$(".tab-panel").forEach(p=>p.classList.toggle("hidden",p.id!=="tab-"+name))}
function profileEditorReset(){editingProfile=null;profileIsNew=false;$("#profileEditor").classList.add("hidden");$("#profileName").value="";$("#profileSource").value="empty";$("#landscapePreview").removeAttribute("src");$("#portraitPreview").removeAttribute("src");$("#landscapeMeta").textContent="Not uploaded";$("#portraitMeta").textContent="Not uploaded"}
function newProfile(){profileEditorReset();profileIsNew=true;editingProfile={id:uid(),created:Date.now(),modified:Date.now(),landscape:null,portrait:null};$("#profileEditorTitle").textContent="Create template profile";$("#profileEditor").classList.remove("hidden")}
async function editProfile(id){const p=profileById(id);profileIsNew=false;editingProfile=clone(p);$("#profileEditorTitle").textContent="Edit profile";$("#profileName").value=p.name;$("#profileSource").value="empty";$("#profileEditor").classList.remove("hidden");await showTemplateSlot("landscape");await showTemplateSlot("portrait")}
async function showTemplateSlot(slot){const p=editingProfile;const t=p?.[slot];const img=$("#"+slot+"Preview"),meta=$("#"+slot+"Meta");if(t){img.src=await dataURL(t.blob);meta.textContent=`${t.width} × ${t.height}px`;}else{img.removeAttribute("src");meta.textContent="Not uploaded"}}
async function saveProfileEditor(){const name=$("#profileName").value.trim();if(!name)return toast("Enter a profile name.");if(!editingProfile)return toast("Profile editor is not initialized. Close it and create the profile again.");const p=clone(editingProfile);p.name=name;p.modified=Date.now();await put("profiles",p);profiles=await all("profiles");if(!activeProfileId)activeProfileId=p.id;activeProfileId=activeProfileId||p.id;await setMeta("activeProfileId",activeProfileId);profileEditorReset();renderProfiles();render();toast("Template profile saved.")}
async function switchProfile(id){if(photos.some(p=>!p.applied)&&!confirm("Some photographs have unfinished edits. Switch the active profile? Existing photographs will keep their assigned profile."))return;activeProfileId=id;await setMeta("activeProfileId",id);render();renderProfiles();toast("Active profile changed. New imports will use this profile.")}
async function deleteProfile(id){
if(id===OFFICIAL_PROFILE_ID)return toast("The built-in official template profile cannot be deleted.");
const assigned=photos.filter(p=>p.profileId===id);const others=profiles.filter(p=>p.id!==id);
if(!others.length&&assigned.length)return toast("Create another profile before deleting the only profile assigned to photographs.");
let reassignment=null;
if(assigned.length){const choices=others.map(p=>p.name).join(", ");const target=prompt(`${assigned.length} photograph(s) use this profile. Enter the exact replacement profile name (${choices}):`,others[0].name);if(target===null)return;reassignment=others.find(p=>p.name.toLowerCase()===target.trim().toLowerCase());if(!reassignment)return toast("No matching profile. Nothing was deleted.");}
if(!confirm(`Delete profile "${profileById(id).name}"? This cannot be undone.`))return;
for(const p of assigned){p.profileId=reassignment.id;const t=reassignment[p.orientation];p.applied=!!t;await savePhoto(p)}
await del("profiles",id);profiles=await all("profiles");
if(activeProfileId===id){activeProfileId=profiles[0]?.id||null;await setMeta("activeProfileId",activeProfileId)}
renderProfiles();render();toast("Profile deleted.")
}
async function validatePNG(file){if(file.type!=="image/png")throw Error("Only PNG template files are accepted.");const buf=await file.slice(0,8).arrayBuffer(),sig=[137,80,78,71,13,10,26,10];if(!sig.every((v,i)=>new Uint8Array(buf)[i]===v))throw Error("The selected file is not a valid PNG.");const bmp=await decode(file);if(!bmp.width||!bmp.height)throw Error("PNG has invalid dimensions.");return{blob:file,width:bmp.width,height:bmp.height}}
async function importTemplate(file,slot){try{if(!editingProfile)throw Error("Create or open a template profile before uploading a PNG.");const t=await validatePNG(file);editingProfile[slot]=t;await showTemplateSlot(slot);toast(`${slot} template loaded.`)}catch(e){toast(e.message)}}
async function importPhotos(files){
const prof=profileById(activeProfileId);if(!prof)return toast("Create a template profile first.");
if(!prof.landscape||!prof.portrait){openSettings();toast("Upload both landscape and portrait templates before importing.");return}
const remaining=MAX_PHOTOS-photos.length;if(remaining<=0)return toast("Workspace limit reached (100 photographs).");
let imported=0,failed=0;
for(const file of [...files].slice(0,remaining)){
try{
if(!/^image\/(jpeg|png|webp)$/.test(file.type))throw Error("Unsupported image type.");
const bmp=await decode(file);if(!bmp.width||!bmp.height)throw Error("Image has invalid dimensions.");
const o=orientation(bmp.width,bmp.height),p={id:uid(),name:file.name,originalName:file.name,blob:file,width:bmp.width,height:bmp.height,orientation:o,profileId:activeProfileId,applied:true,settings:settings(),draft:null,selected:false,order:photos.length,created:Date.now()};
const thumbCanvas=document.createElement("canvas");const scale=Math.min(260/bmp.width,180/bmp.height,1);thumbCanvas.width=Math.max(1,Math.round(bmp.width*scale));thumbCanvas.height=Math.max(1,Math.round(bmp.height*scale));thumbCanvas.getContext("2d").drawImage(bmp,0,0,thumbCanvas.width,thumbCanvas.height);p.thumb=thumbCanvas.toDataURL("image/jpeg",.72);bmp.close?.();await put("photos",p);photos.push(p);imported++;
}catch(e){failed++;console.warn("Import failed",file.name,e)}
}
await saveWorkspace();render();toast(`${imported} imported${failed?`; ${failed} failed`:""}.`);if(files.length>remaining)toast(`Workspace capacity: ${MAX_PHOTOS}. Imported first ${remaining} files.`)
}
function renamePhoto(p){const n=prompt("New photograph filename:",p.name);if(n===null)return;if(!n.trim())return toast("Filename cannot be empty.");p.name=n.trim();savePhoto(p).then(render)}
async function removePhoto(id){if(!confirm("Remove this photograph from the workspace?"))return;await del("photos",id);photos=photos.filter(p=>p.id!==id);await saveWorkspace();render()}
async function removeSelected(){const ids=selected().map(p=>p.id);if(!ids.length)return;if(!confirm(`Remove ${ids.length} selected photographs?`))return;for(const id of ids)await del("photos",id);photos=photos.filter(p=>!ids.includes(p.id));await saveWorkspace();render()}
async function clearWorkspace(){if(!confirm("Clear all photographs from this workspace? Saved template profiles will not be deleted."))return;for(const p of photos)await del("photos",p.id);photos=[];await saveWorkspace();render();toast("Workspace cleared.")}
function selectAction(kind){photos.forEach(p=>p.selected=kind==="all"?true:kind==="none"?false:kind==="invert"?!p.selected:kind==="landscape"?p.orientation==="landscape":p.orientation==="portrait");photos.forEach(savePhoto);render()}
function canvasTransform(ctx,img,tw,th,s){const base=Math.max(tw/img.width,th/img.height);const scale=base*(s.zoom||1);ctx.save();ctx.translate(tw/2+(s.x||0),th/2+(s.y||0));ctx.rotate((s.rotation||0)*Math.PI/180);ctx.scale(scale,scale);ctx.drawImage(img,-img.width/2,-img.height/2);ctx.restore()}
async function composite(p,settingsOverride=null,format="png",quality=1){
if(!p)throw new Error("The selected photograph is no longer in the workspace.");
const t=templateFor(p);
if(!t)throw new Error(`Missing ${p.orientation} template for ${p.name}. Open Settings and restore that template.`);
if(!t.blob||!p.blob)throw new Error(`Image data is missing for ${p.name}. Re-import the photograph or template.`);
let photoImg=null,templateImg=null,c=null;
try{
[photoImg,templateImg]=await Promise.all([decode(p.blob),decode(t.blob)]);
const width=Number(t.width)||templateImg.width||templateImg.naturalWidth;
const height=Number(t.height)||templateImg.height||templateImg.naturalHeight;
if(!width||!height)throw new Error(`The template dimensions are invalid for ${p.name}. Re-upload its PNG template.`);
c=document.createElement("canvas");c.width=width;c.height=height;
const ctx=c.getContext("2d",{alpha:format!=="jpeg"});
if(!ctx)throw new Error("This browser could not create a canvas for the selected template size.");
if(format==="jpeg"){ctx.fillStyle="#fff";ctx.fillRect(0,0,width,height);}
canvasTransform(ctx,photoImg,width,height,settingsOverride||p.settings||settings());
ctx.drawImage(templateImg,0,0,width,height);
const blob=await new Promise((resolve,reject)=>{
try{c.toBlob(result=>result?resolve(result):reject(new Error(`The browser could not encode the ${width}×${height} composition. Try a smaller template or export PNG.`)),format==="jpeg"?"image/jpeg":"image/png",quality);}
catch(err){reject(new Error("Canvas encoding failed: "+(err?.message||String(err))));}
});
if(!blob||!blob.size)throw new Error("The browser generated an empty image file.");
return blob;
}catch(err){
console.error("Composition failed",{photo:p?.name,orientation:p?.orientation,templateWidth:t?.width,templateHeight:t?.height,error:err});
throw new Error(err?.message||String(err)||"Unknown image composition error");
}finally{
photoImg?.close?.();templateImg?.close?.();
if(c){c.width=1;c.height=1;}
}
}
async function openEditor(id){const p=photoById(id);if(!p)return;editorPhotoId=id;editorStart=clone(p.settings);editorDraft=clone(p.draft||p.settings);history=[clone(editorDraft)];historyIndex=0;$("#editorTitle").textContent=p.name;$("#editorProfileNote").textContent=`${p.orientation} · ${profileById(p.profileId)?.name||"Missing profile"} · Template remains fixed`;$("#editorModal").classList.remove("hidden");await renderEditor();syncControls()}
async function renderEditor(){const p=photoById(editorPhotoId),t=templateFor(p);if(!p||!t)return;const canvas=$("#editorCanvas"),maxW=$("#editorCanvas").parentElement.clientWidth-24,maxH=Math.min(window.innerHeight*.55,520);const ratio=Math.min(maxW/t.width,maxH/t.height,1);canvas.width=Math.max(1,Math.round(t.width*ratio));canvas.height=Math.max(1,Math.round(t.height*ratio));const [pi,ti]=await Promise.all([decode(p.blob),decode(t.blob)]);const ctx=canvas.getContext("2d");ctx.clearRect(0,0,canvas.width,canvas.height);canvasTransform(ctx,pi,canvas.width,canvas.height,editorDraft);ctx.drawImage(ti,0,0,canvas.width,canvas.height);pi.close?.();ti.close?.()}
function syncControls(){const s=editorDraft;$("#zoomControl").value=s.zoom;$("#xControl").value=s.x;$("#yControl").value=s.y;$("#rotationControl").value=s.rotation;$("#zoomOutput").textCo
