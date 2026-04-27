import fs from 'fs';
import path from 'path';

const dir = './src';
const exts = ['.tsx', '.ts'];

function walk(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else { 
      if (exts.includes(path.extname(file))) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk(dir);

const replacements = [
  // Backgrounds
  { match: /\bbg-white\b/g, replace: 'bg-[#0a0a0a]' },
  { match: /\bbg-slate-50(?!\/)\b/g, replace: 'bg-[#050505]' },
  { match: /\bbg-slate-50\/50\b/g, replace: 'bg-[#080808]' },
  { match: /\bbg-slate-100\b/g, replace: 'bg-white/5' },
  { match: /\bhover:bg-slate-50\b/g, replace: 'hover:bg-white/5' },
  { match: /\bhover:bg-slate-100\b/g, replace: 'hover:bg-white/10' },
  { match: /\bbg-slate-200\b/g, replace: 'bg-white/10' },
  { match: /\bhover:bg-slate-200\b/g, replace: 'hover:bg-white/10' },
  { match: /\bbg-slate-800\b/g, replace: 'bg-white/10' },
  { match: /\bhover:bg-slate-900\b/g, replace: 'hover:bg-white/20' },
  
  // Borders
  { match: /\bborder-slate-100\b/g, replace: 'border-white/5' },
  { match: /\bborder-slate-200\b/g, replace: 'border-white/10' },
  { match: /\bborder-slate-300\b/g, replace: 'border-white/20' },
  { match: /\bhover:border-slate-300\b/g, replace: 'hover:border-white/20' },
  
  // Texts
  { match: /\btext-slate-900\b/g, replace: 'text-white' },
  { match: /\btext-slate-800\b/g, replace: 'text-[#e0e0e0]' },
  { match: /\btext-slate-700\b/g, replace: 'text-white/80' },
  { match: /\btext-slate-600\b/g, replace: 'text-white/60' },
  { match: /\btext-slate-500\b/g, replace: 'text-white/40' },
  { match: /\btext-slate-400\b/g, replace: 'text-white/30' },
  { match: /\btext-slate-300\b/g, replace: 'text-white/20' },
  { match: /\bhover:text-slate-900\b/g, replace: 'hover:text-white' },
  { match: /\bhover:text-slate-800\b/g, replace: 'hover:text-[#e0e0e0]' },
  { match: /\bhover:text-slate-700\b/g, replace: 'hover:text-white/80' },
  { match: /\bhover:text-slate-600\b/g, replace: 'hover:text-white/60' },
  
  // Shadows
  { match: /\bshadow-sm\b/g, replace: 'shadow-2xl' },
  { match: /\bshadow-md\b/g, replace: 'shadow-2xl' },
  
  // Brand/Amber tweaks (handled centrally via CSS overrides mostly, but ensuring classes map to theme nicely)
  { match: /\bbg-brand-50\b/g, replace: 'bg-amber-500/10' },
  { match: /\bbg-brand-100\b/g, replace: 'bg-amber-500/20' },
  { match: /\bhover:bg-brand-100\b/g, replace: 'hover:bg-amber-500/20' },
  { match: /\bbg-brand-500\b/g, replace: 'bg-amber-500' },
  { match: /\bbg-brand-600\b/g, replace: 'bg-amber-600' },
  { match: /\bbg-brand-700\b/g, replace: 'bg-amber-700' },
  { match: /\bhover:bg-brand-700\b/g, replace: 'hover:bg-amber-500/80' },
  { match: /\btext-brand-500\b/g, replace: 'text-amber-500' },
  { match: /\btext-brand-600\b/g, replace: 'text-amber-500' },
  { match: /\bhover:text-brand-600\b/g, replace: 'hover:text-amber-400' },
  { match: /\btext-brand-700\b/g, replace: 'text-amber-500/80' },
  { match: /\bhover:text-brand-700\b/g, replace: 'hover:text-amber-400' },
  { match: /\bborder-brand-100\b/g, replace: 'border-amber-500/20' },
  { match: /\bborder-brand-200\b/g, replace: 'border-amber-500/40' },
  { match: /\bhover:border-brand-300\b/g, replace: 'hover:border-amber-500/60' },
  { match: /\bhover:border-brand-500\b/g, replace: 'hover:border-amber-500' },
  { match: /\bborder-brand-500\b/g, replace: 'border-amber-500' },

  // Make specific headers font-serif
  { match: /\bfont-semibold text-lg tracking-tight\b/g, replace: 'font-serif italic text-xl tracking-tight' },
  { match: /\bfont-semibold text-\[\#e0e0e0\]\b/g, replace: 'font-serif italic text-white' },
  { match: /\btext-lg font-medium text-\[\#e0e0e0\]\b/g, replace: 'font-serif italic text-xl text-white tracking-tight' },
  { match: /\btext-xl font-medium text-\[\#e0e0e0\]\b/g, replace: 'font-serif italic text-2xl text-white tracking-tight' },
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  replacements.forEach(r => {
    content = content.replace(r.match, r.replace);
  });
  fs.writeFileSync(file, content);
  console.log('Updated ' + file);
});
