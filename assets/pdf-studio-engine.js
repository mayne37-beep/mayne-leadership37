import { init } from '@embedpdf/pdfium';
import { PDFDocument, PDFName, PDFArray, PDFDict, PDFString } from 'pdf-lib';

function repairFormTree(doc) {
  // Page copying retains field dictionaries, but does not attach them to
  // /AcroForm. Reconnect only widgets present on the actual output pages.
  const name=PDFName.of,form=doc.getForm(),roots=new Map(),widgets=new Set();
  const old=form.acroForm.dict.lookupMaybe(name('Fields'),PDFArray);
  const oldRefs=new Set(old?old.asArray().map(ref=>ref.toString()):[]);
  if(old)for(const ref of old.asArray())roots.set(ref.toString(),ref);
  for(const page of doc.getPages()) {
    const annots=page.node.Annots();if(!annots)continue;
    for(const ref of annots.asArray()) {
      const widget=doc.context.lookup(ref);if(!(widget instanceof PDFDict)||widget.get(name('Subtype'))?.toString()!=='/Widget')continue;
      widgets.add(ref.toString());widget.set(name('P'),page.ref);
      let node=widget,rootRef=ref;const seen=new Set();
      while(node.get(name('Parent'))) {const parentRef=node.get(name('Parent'));if(seen.has(parentRef.toString()))throw new Error('This PDF has a malformed form hierarchy.');seen.add(parentRef.toString());const parent=doc.context.lookup(parentRef);if(!(parent instanceof PDFDict)||parent.get(name('Type'))?.toString()==='/Page')throw new Error('This PDF has a malformed field parent.');node=parent;rootRef=parentRef;}
      roots.set(rootRef.toString(),rootRef);
    }
  }
  const prune=(ref,seen=new Set())=>{if(seen.has(ref.toString()))return false;seen.add(ref.toString());const node=doc.context.lookup(ref);if(!(node instanceof PDFDict))return false;if(node.get(name('Subtype'))?.toString()==='/Widget')return widgets.has(ref.toString());const kids=node.lookupMaybe(name('Kids'),PDFArray);if(!kids)return oldRefs.has(ref.toString());for(let i=kids.size()-1;i>=0;i--)if(!prune(kids.get(i),new Set(seen)))kids.remove(i);return kids.size()>0||oldRefs.has(ref.toString());};
  const kept=[],usedNames=new Set();
  for(const ref of roots.values())if(prune(ref)){const node=doc.context.lookup(ref),title=node.get(name('T'));let label=title?.decodeText?.()||'';if(label){const base=label;let suffix=2;while(usedNames.has(label))label=base+'_'+suffix++;if(label!==base)node.set(name('T'),PDFString.of(label));usedNames.add(label);}kept.push(ref);}
  form.acroForm.dict.set(name('Fields'),doc.context.obj(kept));form.acroForm.dict.set(name('NeedAppearances'),doc.context.obj(false));
}

// All document bytes stay in this browser's WebAssembly memory.
export class PdfStudioEngine {
  constructor(module) { this.p = module; this.doc = 0; this.inputPtr = 0; this.pages = new Map(); this.form = 0; this.formInfo = 0; }
  static async create(wasmBinary) {
    const module = await init({ wasmBinary });
    module.PDFiumExt_Init();
    return new PdfStudioEngine(module);
  }
  get heap() { return this.p.pdfium.HEAPU8; }
  malloc(n) { const ptr = this.p.pdfium.wasmExports.malloc(Math.max(n, 1)); if (!ptr) throw new Error('Not enough memory for this document.'); return ptr; }
  free(ptr) { if (ptr) this.p.pdfium.wasmExports.free(ptr); }
  values(n, fn, kind = 'float') {
    const ptr = this.malloc(n * (kind === 'double' ? 8 : 4));
    try { fn(ptr); const size = kind === 'double' ? 8 : 4; return Array.from({length:n}, (_,i) => this.p.pdfium.getValue(ptr + i * size, kind)); } finally { this.free(ptr); }
  }
  floats(values, fn) { const ptr = this.malloc(values.length * 4); try { values.forEach((v,i)=>this.p.pdfium.setValue(ptr+i*4,v,'float')); return fn(ptr); } finally { this.free(ptr); } }
  ints(values, fn) { const ptr = this.malloc(values.length * 4); try { values.forEach((v,i)=>this.p.pdfium.setValue(ptr+i*4,v,'i32')); return fn(ptr); } finally { this.free(ptr); } }
  bytes(data, fn) { const ptr = this.malloc(data.length); try { this.heap.set(data,ptr); return fn(ptr); } finally { this.free(ptr); } }
  wstring(text, fn) { const ptr = this.malloc((text.length+1)*2); try { for (let i=0;i<text.length;i++) this.p.pdfium.setValue(ptr+i*2,text.charCodeAt(i),'i16'); this.p.pdfium.setValue(ptr+text.length*2,0,'i16'); return fn(ptr); } finally { this.free(ptr); } }
  readWide(fn) { const size = fn(0,0); if (!size || size > 2e7) return ''; const ptr = this.malloc(size); try { fn(ptr,size); return new TextDecoder('utf-16le').decode(this.heap.slice(ptr,ptr+size)).replace(/\0+$/,''); } finally { this.free(ptr); } }
  readAscii(fn) { const size=fn(0,0); if(!size || size>65536) return ''; const ptr=this.malloc(size); try { fn(ptr,size); return new TextDecoder().decode(this.heap.slice(ptr,ptr+size)).replace(/\0+$/,''); } finally { this.free(ptr); } }
  closePages() { for (const page of this.pages.values()) { if(this.form) this.p.FORM_OnBeforeClosePage(page,this.form); this.p.FPDF_ClosePage(page); } this.pages.clear(); }
  close() {
    this.closePages();
    if(this.form) this.p.PDFiumExt_ExitFormFillEnvironment(this.form);
    if(this.formInfo) this.p.PDFiumExt_CloseFormFillInfo(this.formInfo);
    if(this.doc) this.p.FPDF_CloseDocument(this.doc);
    this.free(this.inputPtr); this.doc=0; this.inputPtr=0; this.form=0; this.formInfo=0;
  }
  setupForms() { this.formInfo=this.p.PDFiumExt_OpenFormFillInfo(); this.form=this.p.PDFiumExt_InitFormFillEnvironment(this.doc,this.formInfo); }
  load(data, password = '') {
    // Check a new document before closing the current one.
    const bytes=new Uint8Array(data); const ptr=this.malloc(bytes.length); this.heap.set(bytes,ptr);
    const doc=this.p.FPDF_LoadMemDocument(ptr,bytes.length,password || 0);
    if(!doc) { const code=this.p.FPDF_GetLastError(); this.free(ptr); const error=new Error(code===4?'This PDF needs the correct password.':'This file could not be opened as a PDF.'); error.code=code; throw error; }
    this.close(); this.doc=doc; this.inputPtr=ptr; this.password=password; this.setupForms();
    return this.info();
  }
  create() { this.close(); this.doc=this.p.FPDF_CreateNewDocument(); this.password=''; this.setupForms(); this.addPage(); return this.info(); }
  info() {
    const encrypted=!!this.p.EPDF_IsEncrypted(this.doc);
    const owner=!!this.p.EPDF_IsOwnerUnlocked(this.doc);
    const permissions=this.p.FPDF_GetDocPermissions(this.doc)>>>0;
    return { count:this.p.FPDF_GetPageCount(this.doc), encrypted, owner, permissions, editable:!encrypted || owner || !!(permissions & 8), formEditable:!encrypted || owner || !!(permissions & 256), signatures:this.p.FPDF_GetSignatureCount(this.doc) };
  }
  assertEditable() { if(!this.info().editable) throw new Error('This PDF restricts editing. Open it with the owner password to edit its content.'); }
  page(index) { if(!this.pages.has(index)) { const page=this.p.FPDF_LoadPage(this.doc,index); if(!page) throw new Error('Could not open this page.'); this.pages.set(index,page); if(this.form) this.p.FORM_OnAfterLoadPage(page,this.form); } return this.pages.get(index); }
  size(index) { const page=this.page(index); return { width:this.p.FPDF_GetPageWidthF(page), height:this.p.FPDF_GetPageHeightF(page), rotation:this.p.FPDFPage_GetRotation(page) }; }
  generate(index) { if(!this.p.FPDFPage_GenerateContent(this.page(index))) throw new Error('PDF content could not be updated.'); }
  save() {
    const writer=this.p.PDFiumExt_OpenFileWriter(); let ptr=0;
    try { this.p.PDFiumExt_SaveAsCopy(this.doc,writer); const size=this.p.PDFiumExt_GetFileWriterSize(writer); if(size<8) throw new Error('Could not save this PDF.'); ptr=this.malloc(size); this.p.PDFiumExt_GetFileWriterData(writer,ptr,size); return this.heap.slice(ptr,ptr+size); } finally { this.free(ptr); this.p.PDFiumExt_CloseFileWriter(writer); }
  }
  render(index, scale = 1) {
    const page=this.page(index), size=this.size(index); let width=Math.max(1,Math.round(size.width*scale)),height=Math.max(1,Math.round(size.height*scale));
    if(width*height>20000000) { const ratio=Math.sqrt(20000000/(width*height)); width=Math.round(width*ratio);height=Math.round(height*ratio); }
    const bitmap=this.p.FPDFBitmap_Create(width,height,1);
    if(!bitmap) throw new Error('Could not render this page.');
    try {
      this.p.FPDFBitmap_FillRect(bitmap,0,0,width,height,0xffffffff);
      this.p.FPDF_RenderPageBitmap(bitmap,page,0,0,width,height,0,1 | 2);
      if(this.form) this.p.FPDF_FFLDraw(this.form,bitmap,page,0,0,width,height,0,1);
      const src=this.p.FPDFBitmap_GetBuffer(bitmap),stride=this.p.FPDFBitmap_GetStride(bitmap),rgba=new Uint8ClampedArray(width*height*4);
      const heap=this.heap;
      for(let y=0;y<height;y++) for(let x=0;x<width;x++) { const i=src+y*stride+x*4,j=(y*width+x)*4; rgba[j]=heap[i+2];rgba[j+1]=heap[i+1];rgba[j+2]=heap[i];rgba[j+3]=heap[i+3]; }
      return {width,height,rgba};
    } finally { this.p.FPDFBitmap_Destroy(bitmap); }
  }
  devicePoint(index,x,y,width,height) { const page=this.page(index); return this.values(2,ptr=>{ if(!this.p.FPDF_DeviceToPage(page,0,0,Math.round(width),Math.round(height),0,Math.round(x),Math.round(y),ptr,ptr+8)) throw new Error('Invalid page coordinates.'); },'double'); }
  screenPoint(index,x,y,width,height) { const page=this.page(index); return this.values(2,ptr=>this.p.FPDF_PageToDevice(page,0,0,Math.round(width),Math.round(height),0,x,y,ptr,ptr+4),'i32'); }
  screenRect(index,rect,width,height) { const points=[[rect[0],rect[1]],[rect[0],rect[3]],[rect[2],rect[1]],[rect[2],rect[3]]].map(([x,y])=>this.screenPoint(index,x,y,width,height)); const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);return {x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)}; }
  pageRect(index,rect,width,height) { const corners=[[rect.x,rect.y],[rect.x+rect.w,rect.y],[rect.x,rect.y+rect.h],[rect.x+rect.w,rect.y+rect.h]].map(([x,y])=>this.devicePoint(index,x,y,width,height)); return [Math.min(...corners.map(p=>p[0])),Math.min(...corners.map(p=>p[1])),Math.max(...corners.map(p=>p[0])),Math.max(...corners.map(p=>p[1]))]; }
  bounds(obj) { return this.values(4,ptr=>{ if(!this.p.FPDFPageObj_GetBounds(obj,ptr,ptr+4,ptr+8,ptr+12)) throw new Error('Cannot inspect this PDF object.'); }); }
  matrix(obj) { return this.values(6,ptr=>this.p.FPDFPageObj_GetMatrix(obj,ptr)); }
  setMatrix(obj,matrix) { if(!this.floats(matrix,ptr=>this.p.FPDFPageObj_SetMatrix(obj,ptr))) throw new Error('Could not position the PDF object.'); }
  objectText(obj,page) { const textPage=this.p.FPDFText_LoadPage(page); try { return this.readWide((ptr,size)=>this.p.FPDFTextObj_GetText(obj,textPage,ptr,size)); } finally { this.p.FPDFText_ClosePage(textPage); } }
  objects(index) {
    const page=this.page(index), out=[];
    for(let i=0;i<this.p.FPDFPage_CountObjects(page);i++) {
      const ptr=this.p.FPDFPage_GetObject(page,i), type=this.p.FPDFPageObj_GetType(ptr); let rect;
      try {rect=this.bounds(ptr);} catch {continue;}
      const item={ptr,index:i,type,rect,matrix:this.matrix(ptr),label:type===1?'Text':type===3?'Image':type===2?'Shape':type===5?'Object group':'Graphic'};
      if(type===1) { item.text=this.objectText(ptr,page); item.size=this.values(1,p=>this.p.FPDFTextObj_GetFontSize(ptr,p))[0]; const font=this.p.FPDFTextObj_GetFont(ptr); item.font=this.readAscii((p,n)=>this.p.FPDFFont_GetBaseFontName(font,p,n)); item.color=this.values(4,p=>this.p.FPDFPageObj_GetFillColor(ptr,p,p+4,p+8,p+12),'i32'); item.label=item.text || 'Text'; }
      out.push(item);
    }
    return out;
  }
  pageText(index) { const tp=this.p.FPDFText_LoadPage(this.page(index)); if(!tp) return ''; try { const count=this.p.FPDFText_CountChars(tp); if(!count) return ''; const ptr=this.malloc((count+1)*2); try {this.p.FPDFText_GetText(tp,0,count,ptr);return new TextDecoder('utf-16le').decode(this.heap.slice(ptr,ptr+count*2)).replace(/\0/g,'');} finally {this.free(ptr);} } finally {this.p.FPDFText_ClosePage(tp);} }
  color(obj,hex,alpha=255,stroke=false) { const c=hex.replace('#',''); const rgb=[parseInt(c.slice(0,2),16),parseInt(c.slice(2,4),16),parseInt(c.slice(4,6),16)]; const result=stroke?this.p.FPDFPageObj_SetStrokeColor(obj,...rgb,alpha):this.p.FPDFPageObj_SetFillColor(obj,...rgb,alpha); if(!result) throw new Error('Could not apply the color.'); }
  textObject(text,size,font='Helvetica',originalFont=0) { const obj=originalFont?this.p.FPDFPageObj_CreateTextObj(this.doc,originalFont,size):this.p.FPDFPageObj_NewTextObj(this.doc,font,size); if(!obj) throw new Error('This font is not supported for editing. Choose another font.'); if(!this.wstring(text,p=>this.p.FPDFText_SetText(obj,p))) { this.p.FPDFPageObj_Destroy(obj); throw new Error('The selected font cannot display this text.'); } return obj; }
  addText(index,text,x,y,{size=14,font='Helvetica',color='#152d49',lineHeight=1.35,opacity=255}={}) {
    this.assertEditable(); const page=this.page(index),out=[];
    for(const [i,line] of text.split('\n').entries()) {
      if(!line) continue;
      const obj=this.textObject(line,size,font); this.color(obj,color,opacity); this.setMatrix(obj,[1,0,0,1,x,y-i*size*lineHeight]); this.p.FPDFPage_InsertObject(page,obj); out.push(obj);
    }
    this.generate(index); return out;
  }
  replaceText(index,item,text,{size=item.size,font='original',color=null,fit=false}={}) {
    this.assertEditable(); if(item.type!==1) throw new Error('Select a text object first.'); if(!text.trim()) {this.removeObject(index,item);return {fallback:false};}
    const page=this.page(index),originalFont=this.p.FPDFTextObj_GetFont(item.ptr); let fallback=false;
    const lines=text.split('\n'); const made=[];
    try {
      for(const [i,line] of lines.entries()) {
        if(!line) continue;
        let obj=this.textObject(line,size,font==='original'?'Helvetica':font,font==='original'?originalFont:0);
        this.p.FPDFPage_InsertObject(page,obj); made.push(obj);
        // A subset font may lack characters even when PDFium returns success.
        if(this.objectText(obj,page).replace(/\r?\n/g,'')!==line) {
          this.p.FPDFPage_RemoveObject(page,obj); this.p.FPDFPageObj_Destroy(obj);made.pop();
          if(font!=='original') throw new Error('Some characters are unavailable in this font. Use a Latin font or remove the unsupported characters.');
          obj=this.textObject(line,size,'Helvetica');this.p.FPDFPage_InsertObject(page,obj);made.push(obj); fallback=true;
          if(this.objectText(obj,page).replace(/\r?\n/g,'')!==line) throw new Error('Some characters need a font that is not available. The original text has been kept.');
        }
        const m=[...item.matrix]; m[4]-=i*size*1.35*m[2];m[5]-=i*size*1.35*m[3];this.setMatrix(obj,m);
        if(color) this.color(obj,color); else this.p.FPDFPageObj_SetFillColor(obj,...(item.color||[21,45,73,255]));
        if(fit && lines.length===1) {const r=this.bounds(obj),oldWidth=item.rect[2]-item.rect[0],width=r[2]-r[0];if(width>0&&oldWidth>0) this.p.FPDFPageObj_Transform(obj,oldWidth/width,0,0,1,item.rect[0]*(1-oldWidth/width),0);}
      }
      if(!this.p.FPDFPage_RemoveObject(page,item.ptr)) throw new Error('Could not replace the original text.');this.p.FPDFPageObj_Destroy(item.ptr);this.generate(index); return {fallback};
    } catch(e) { for(const obj of made) if(this.p.FPDFPage_RemoveObject(page,obj)) this.p.FPDFPageObj_Destroy(obj); throw e; }
  }
  removeObject(index,item) { this.assertEditable(); if(!this.p.FPDFPage_RemoveObject(this.page(index),item.ptr)) throw new Error('Cannot remove this object.');this.p.FPDFPageObj_Destroy(item.ptr);this.generate(index); }
  moveObject(index,item,dx,dy) { this.assertEditable(); this.p.FPDFPageObj_Transform(item.ptr,1,0,0,1,dx,dy);this.generate(index); }
  resizeObject(index,item,width,height) { this.assertEditable(); const r=this.bounds(item.ptr),w=r[2]-r[0],h=r[3]-r[1];if(w<=0||h<=0||width<=0||height<=0) throw new Error('Enter a positive width and height.');const sx=width/w,sy=height/h;this.p.FPDFPageObj_Transform(item.ptr,sx,0,0,sy,r[0]*(1-sx),r[1]*(1-sy));this.generate(index); }
  imageObject(index,data) { const page=this.page(index),obj=this.p.FPDFPageObj_NewImageObj(this.doc);if(!obj) throw new Error('Could not create this image.');const ok=this.bytes(new Uint8Array(data),ptr=>this.p.EPDFImageObj_SetPng(page,0,obj,ptr,data.byteLength));if(!ok) {this.p.FPDFPageObj_Destroy(obj);throw new Error('This image could not be inserted.');} return obj; }
  addImage(index,data,rect) { this.assertEditable();const obj=this.imageObject(index,data);this.setMatrix(obj,[rect[2]-rect[0],0,0,rect[3]-rect[1],rect[0],rect[1]]);this.p.FPDFPage_InsertObject(this.page(index),obj);this.generate(index);return obj; }
  replaceImage(index,item,data) { this.assertEditable();const obj=this.imageObject(index,data);this.setMatrix(obj,item.matrix);const page=this.page(index);if(!this.p.FPDFPage_InsertObjectAtIndex(page,obj,item.index)) {this.p.FPDFPageObj_Destroy(obj);throw new Error('Could not replace the image.');} if(!this.p.FPDFPage_RemoveObject(page,item.ptr)) throw new Error('Could not remove the original image.');this.p.FPDFPageObj_Destroy(item.ptr);this.generate(index); }
  addShape(index,kind,rect,{color='#235d97',width=2,fill=false,opacity=255}={}) {
    this.assertEditable(); const [l,b,r,t]=rect; let obj;
    if(kind==='line') {obj=this.p.FPDFPageObj_CreateNewPath(l,b);this.p.FPDFPath_LineTo(obj,r,t);}
    else if(kind==='ellipse') { const x=(l+r)/2,y=(b+t)/2,rx=(r-l)/2,ry=(t-b)/2,k=.5522847498;obj=this.p.FPDFPageObj_CreateNewPath(x+rx,y);this.p.FPDFPath_BezierTo(obj,x+rx,y+k*ry,x+k*rx,y+ry,x,y+ry);this.p.FPDFPath_BezierTo(obj,x-k*rx,y+ry,x-rx,y+k*ry,x-rx,y);this.p.FPDFPath_BezierTo(obj,x-rx,y-k*ry,x-k*rx,y-ry,x,y-ry);this.p.FPDFPath_BezierTo(obj,x+k*rx,y-ry,x+rx,y-k*ry,x+rx,y);this.p.FPDFPath_Close(obj);}
    else obj=this.p.FPDFPageObj_CreateNewRect(l,b,r-l,t-b);
    this.color(obj,color,opacity,true);this.color(obj,color,opacity);this.p.FPDFPageObj_SetStrokeWidth(obj,width);this.p.FPDFPath_SetDrawMode(obj,fill?2:0,true);if(opacity<255) this.p.FPDFPageObj_SetBlendMode(obj,'Multiply');this.p.FPDFPage_InsertObject(this.page(index),obj);this.generate(index);return obj;
  }
  addInk(index,points,{color='#152d49',width=2}={}) { this.assertEditable();if(points.length<2)return;const obj=this.p.FPDFPageObj_CreateNewPath(...points[0]);for(const p of points.slice(1))this.p.FPDFPath_LineTo(obj,...p);this.color(obj,color,255,true);this.p.FPDFPageObj_SetStrokeWidth(obj,width);this.p.FPDFPageObj_SetLineCap(obj,1);this.p.FPDFPageObj_SetLineJoin(obj,1);this.p.FPDFPath_SetDrawMode(obj,0,true);this.p.FPDFPage_InsertObject(this.page(index),obj);this.generate(index);return obj; }
  rotate(index,steps=1) { this.assertEditable();const page=this.page(index);this.p.FPDFPage_SetRotation(page,(this.p.FPDFPage_GetRotation(page)+steps+4)%4); }
  addPage(width=612,height=792,at=this.p.FPDF_GetPageCount(this.doc)) { this.assertEditable();this.closePages();const page=this.p.FPDFPage_New(this.doc,at,width,height);if(!page)throw new Error('Cannot add a page.');this.p.FPDF_ClosePage(page); }
  deletePage(index) {this.assertEditable();if(this.info().count<2)throw new Error('Keep at least one page in the document.');this.closePages();this.p.FPDFPage_Delete(this.doc,index);}
  movePage(index,to) {this.assertEditable();this.closePages();if(!this.ints([index],p=>this.p.FPDF_MovePages(this.doc,p,1,to))) throw new Error('Could not move this page.');}
  async duplicatePage(index) {
    this.assertEditable();
    if(this.hasFields(index)) {
      if(this.info().encrypted)throw new Error('Remove document password protection first to duplicate form pages.');
      const doc=await PDFDocument.load(this.save(),{updateMetadata:false}),[copy]=await doc.copyPages(doc,[index]);
      doc.insertPage(index+1,copy);repairFormTree(doc);this.load(await doc.save({updateFieldAppearances:false}));return;
    }
    const bytes=this.save(),ptr=this.malloc(bytes.length);this.heap.set(bytes,ptr);const src=this.p.FPDF_LoadMemDocument(ptr,bytes.length,this.password||0);
    try{if(!src)throw new Error('Cannot duplicate this page.');this.closePages();if(!this.p.FPDF_ImportPages(this.doc,src,String(index+1),index+1))throw new Error('Cannot duplicate this page.');}finally{if(src)this.p.FPDF_CloseDocument(src);this.free(ptr);}
  }
  async merge(data,password='') {
    this.assertEditable();const source=new PdfStudioEngine(this.p);
    try {
      source.load(data,password);const count=source.info().count;
      let forms=false;for(let i=0;i<count;i++)if(source.hasFields(i)){forms=true;break;}
      if(forms) {
        if(this.info().encrypted||source.info().encrypted)throw new Error('Remove password protection before merging PDFs with form fields.');
        const doc=await PDFDocument.load(this.save(),{updateMetadata:false}),src=await PDFDocument.load(source.save(),{updateMetadata:false});
        const copied=await doc.copyPages(src,src.getPageIndices());for(const page of copied)doc.addPage(page);repairFormTree(doc);this.load(await doc.save({updateFieldAppearances:false}));
      }else{this.closePages();if(!this.p.FPDF_ImportPages(this.doc,source.doc,0,this.info().count))throw new Error('Could not merge the PDFs.');}
    }finally{source.close();}
  }
  async extract(indices) {
    if(indices.some(i=>this.hasFields(i))) {
      if(this.info().encrypted)throw new Error('Remove document password protection first to extract form pages.');
      const src=await PDFDocument.load(this.save(),{updateMetadata:false}),doc=await PDFDocument.create(),pages=await doc.copyPages(src,indices);for(const page of pages)doc.addPage(page);repairFormTree(doc);return doc.save({updateFieldAppearances:false});
    }
    const dest=this.p.FPDF_CreateNewDocument();try{if(!this.ints(indices,p=>this.p.FPDF_ImportPagesByIndex(dest,this.doc,p,indices.length,0)))throw new Error('Could not extract these pages.');const current=this.doc;try{this.doc=dest;return this.save();}finally{this.doc=current;}}finally{this.p.FPDF_CloseDocument(dest);}
  }
  crop(index,rect) {this.assertEditable();const [l,b,r,t]=rect;if(r-l<10||t-b<10)throw new Error('Select a larger area.');this.p.FPDFPage_SetCropBox(this.page(index),l,b,r,t);this.closePages();}
  redact(index,rect) {this.assertEditable();const page=this.page(index),a=this.p.EPDFPage_CreateAnnot(page,28);if(!a)throw new Error('Redaction is unavailable for this PDF.');try{this.floats([rect[0],rect[3],rect[2],rect[1]],p=>this.p.FPDFAnnot_SetRect(a,p));this.p.EPDFAnnot_SetColor(a,0,0,0,0);this.p.EPDFAnnot_SetColor(a,1,0,0,0);if(!this.p.EPDFAnnot_ApplyRedaction(page,a))throw new Error('Could not apply the redaction.');this.generate(index);}finally{this.p.FPDFPage_CloseAnnot(a);}this.closePages();this.addShape(index,'rect',rect,{color:'#111111',fill:true,width:0});}
  comment(index,rect,text) {this.assertEditable();const page=this.page(index),a=this.p.EPDFPage_CreateAnnot(page,1);if(!a)throw new Error('Could not add a comment.');try{this.floats([rect[0],rect[3],rect[2],rect[1]],p=>this.p.FPDFAnnot_SetRect(a,p));this.wstring(text,p=>this.p.FPDFAnnot_SetStringValue(a,'Contents',p));this.p.EPDFAnnot_SetColor(a,0,217,165,78);this.p.FPDFAnnot_SetFlags(a,4);this.p.EPDFAnnot_GenerateAppearance(a);}finally{this.p.FPDFPage_CloseAnnot(a);}}
  annotations(index) {
    const page=this.page(index),out=[];
    for(let i=0;i<this.p.FPDFPage_GetAnnotCount(page);i++){const a=this.p.FPDFPage_GetAnnot(page,i);if(!a)continue;try{const type=this.p.FPDFAnnot_GetSubtype(a),rect=this.values(4,p=>this.p.FPDFAnnot_GetRect(a,p));const item={annotIndex:i,type,rect:[rect[0],rect[3],rect[2],rect[1]],label:this.readWide((p,n)=>this.p.FPDFAnnot_GetStringValue(a,'Contents',p,n))};if(type===20&&this.form){item.fieldType=this.p.FPDFAnnot_GetFormFieldType(this.form,a);item.name=this.readWide((p,n)=>this.p.FPDFAnnot_GetFormFieldName(this.form,a,p,n));item.value=this.readWide((p,n)=>this.p.FPDFAnnot_GetFormFieldValue(this.form,a,p,n));item.flags=this.p.FPDFAnnot_GetFormFieldFlags(this.form,a);item.checked=this.p.FPDFAnnot_IsChecked(this.form,a);item.options=Array.from({length:Math.max(0,this.p.FPDFAnnot_GetOptionCount(this.form,a))},(_,j)=>this.readWide((p,n)=>this.p.FPDFAnnot_GetOptionLabel(this.form,a,j,p,n)));}out.push(item);}finally{this.p.FPDFPage_CloseAnnot(a);}}
    return out;
  }
  hasFields(index) {const page=this.page(index);for(let i=0;i<this.p.FPDFPage_GetAnnotCount(page);i++){const a=this.p.FPDFPage_GetAnnot(page,i);if(!a)continue;try{if(this.p.FPDFAnnot_GetSubtype(a)===20)return true;}finally{this.p.FPDFPage_CloseAnnot(a);}}return false;}
  async removeAnnotation(index,item) {
    this.assertEditable();
    if(item.type===20) {
      if(this.info().encrypted)throw new Error('Remove document password protection first to delete a form field.');
      // Deleting only the widget leaves stale references in /AcroForm/Fields.
      // Remove the canonical field and every widget together.
      const doc=await PDFDocument.load(this.save(),{updateMetadata:false});
      const form=doc.getForm(),field=form.getField(item.name);
      const widgets=new Set(field.acroField.getWidgets().map(widget=>widget.dict));
      const doomed=new Set([field.ref.toString()]);
      for(const page of doc.getPages()) {const annots=page.node.Annots();if(!annots)continue;for(let i=0;i<annots.size();i++){const ref=annots.get(i);if(widgets.has(doc.context.lookup(ref)))doomed.add(ref.toString());}}
      form.removeField(field);
      // pdf-lib 1.17 can remove a widget's appearance reference rather than
      // its page annotation reference. Clean the exact collected widget refs.
      for(const page of doc.getPages()) {const annots=page.node.Annots();if(!annots)continue;for(let i=annots.size()-1;i>=0;i--)if(doomed.has(annots.get(i).toString()))annots.remove(i);}
      this.load(await doc.save({updateFieldAppearances:false}));return;
    }
    const page=this.page(index),a=this.p.FPDFPage_GetAnnot(page,item.annotIndex);
    try{const objectNumber=a?this.p.EPDFAnnot_GetObjectNumber(a):0;if(!objectNumber||!this.p.EPDFPage_RemoveAnnotByObjectNumber(page,objectNumber))throw new Error('Could not remove this annotation.');}finally{if(a)this.p.FPDFPage_CloseAnnot(a);}this.closePages();
  }
  fillField(index,item,value) {
    if(!this.info().formEditable)throw new Error('This PDF restricts form filling.');if(item.flags&1)throw new Error('This field is read-only.');
    const page=this.page(index),a=this.p.FPDFPage_GetAnnot(page,item.annotIndex);try{
      if(item.fieldType===2||item.fieldType===3){if(!this.p.FORM_SetFocusedAnnot(this.form,a))throw new Error('Could not select this field.');if(!!this.p.FPDFAnnot_IsChecked(this.form,a)!==!!value)this.p.FORM_OnChar(this.form,page,13,0);this.p.FORM_ForceToKillFocus(this.form);}
      else {if(!this.wstring(String(value),p=>this.p.EPDFAnnot_SetFormFieldValue(this.form,a,p)))throw new Error('Could not fill this field.');if(!this.p.EPDFAnnot_GenerateFormFieldAP(a))throw new Error('Could not refresh the field appearance.');}
    }finally{this.p.FPDFPage_CloseAnnot(a);}
  }
  createField(index,rect,name,type=6) {this.assertEditable();const page=this.page(index),a=this.wstring(name,p=>this.p.EPDFPage_CreateFormField(page,this.form,type,p));if(!a)throw new Error('Could not create the form field.');try{this.floats([rect[0],rect[3],rect[2],rect[1]],p=>this.p.FPDFAnnot_SetRect(a,p));this.p.FPDFAnnot_SetFlags(a,4);this.p.EPDFAnnot_SetBorderStyle(a,0,1);this.p.EPDFAnnot_SetMKColor(a,0,180,198,218);this.p.EPDFAnnot_SetMKColor(a,1,246,250,255);this.p.EPDFAnnot_SetDefaultAppearance(a,4,12,21,45,73);if(type===6)this.wstring('',p=>this.p.EPDFAnnot_SetFormFieldValue(this.form,a,p));if(!this.p.EPDFAnnot_GenerateFormFieldAP(a))throw new Error('Could not generate this field.');}finally{this.p.FPDFPage_CloseAnnot(a);}this.closePages();}
  async flatten(index) {
    this.assertEditable();if(this.info().encrypted)throw new Error('Remove document password protection first to flatten form fields.');
    const before=await PDFDocument.load(this.save(),{updateMetadata:false});
    const originalAnnots=before.getPage(index).node.Annots();
    const targets=new Set(originalAnnots?originalAnnots.asArray().map(ref=>ref.toString()):[]);
    const result=this.p.FPDFPage_Flatten(this.page(index),0);if(result===0)throw new Error('Could not flatten this page.');this.closePages();
    if(!targets.size)return;
    const doc=await PDFDocument.load(this.save(),{updateMetadata:false}),form=doc.getForm();
    for(const field of form.getFields()) {
      const widgets=field.acroField.getWidgets();
      const widgetRefs=widgets.map(widget=>doc.context.getObjectRef(widget.dict));
      const affected=widgetRefs.filter(ref=>ref&&targets.has(ref.toString()));
      if(!affected.length)continue;
      if(affected.length===widgets.length){form.acroForm.removeField(field.acroField);for(const ref of affected)doc.context.delete(ref);doc.context.delete(field.ref);}
      else {const kids=field.acroField.dict.lookupMaybe(PDFName.of('Kids'),PDFArray);if(kids)for(let i=kids.size()-1;i>=0;i--){const ref=kids.get(i);if(targets.has(ref.toString())){kids.remove(i);doc.context.delete(ref);}}}
    }
    this.load(await doc.save({updateFieldAppearances:false}));
  }
  setPassword(password) {this.assertEditable();if(password.length<4)throw new Error('Use at least four characters for the password.');if(!this.p.EPDF_SetEncryption(this.doc,password,password,0xfffffffc))throw new Error('Could not add password protection.');this.password=password;}
  unlockOwner(password) {if(!this.p.EPDF_UnlockOwnerPermissions(this.doc,password))throw new Error('That owner password is incorrect.');this.password=password;}
  removePassword() {if(this.info().encrypted&&!this.info().owner)throw new Error('Open this PDF with its owner password first.');if(!this.p.EPDF_RemoveEncryption(this.doc))throw new Error('Could not remove protection.');this.password='';}
  setMetadata(values) {this.assertEditable();for(const [key,value]of Object.entries(values))if(!this.wstring(String(value),p=>this.p.EPDF_SetMetaText(this.doc,key,p)))throw new Error('Could not update the document details.');}
  metadata() {return Object.fromEntries(['Title','Author','Subject','Keywords'].map(key=>[key,this.readWide((p,n)=>this.p.FPDF_GetMetaText(this.doc,key,p,n))]));}
}
