export function splitTextIntoLines(text:string, maxCharsPerLine:number, maxLines:number) {
  const words = (text||'').split(/\s+/).filter(Boolean)
  if (!words.length) return [] as string[]
  const lines:string[]=[]
  let current=''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length <= maxCharsPerLine) current = next
    else { if (current) lines.push(current); current = word; if (lines.length === maxLines - 1) break }
  }
  if (lines.length < maxLines && current) lines.push(current)
  return lines.slice(0,maxLines)
}
export function loadFileAsDataUrl(file:File) { return new Promise<string>((resolve,reject)=>{ const r=new FileReader(); r.onload=()=>resolve(String(r.result||'')); r.onerror=reject; r.readAsDataURL(file) }) }
export const percentX=(v:number,w:number)=>v/100*w
export const percentY=(v:number,h:number)=>v/100*h
export function rgba(hex:string, opacity:number) { if(!hex?.startsWith('#')) return hex; const n=hex.replace('#',''); const full=n.length===3?n.split('').map(c=>c+c).join(''):n; const r=parseInt(full.slice(0,2),16), g=parseInt(full.slice(2,4),16), b=parseInt(full.slice(4,6),16); return `rgba(${r},${g},${b},${opacity})` }
