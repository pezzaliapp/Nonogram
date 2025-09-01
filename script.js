/* Nonogram PWA — PezzaliAPP (aligned clues) */
document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // --- DOM refs ---
  const boardEl   = document.getElementById('board');
  const rowCluesEl= document.getElementById('rowClues');
  const colCluesEl= document.getElementById('colClues');
  const presetSel = document.getElementById('preset');
  const newBtn    = document.getElementById('newBtn');
  const clearBtn  = document.getElementById('clearBtn');
  const checkBtn  = document.getElementById('checkBtn');
  const hintBtn   = document.getElementById('hintBtn');
  const deduceBtn = document.getElementById('deduceBtn');
  const solveBtn  = document.getElementById('solveBtn');
  const exportBtn = document.getElementById('exportBtn');
  const importInput = document.getElementById('importInput');
  const installBtn = document.getElementById('installBtn');

  // --- State ---
  let grid = [];      // 0=unknown, 1=full, -1=x
  let rowClues = [];
  let colClues = [];
  let R = 0, C = 0;

  // --- Presets defined as images (strings), then converted to clues ---
  const PRESETS = {
    heart10: [
      "....##....",
      "...####...",
      "..######..",
      ".########.",
      ".########.",
      ".########.",
      "..######..",
      "...####...",
      "....##....",
      ".....#....",
    ],
    smile10: [
      "..........",
      "..######..",
      ".#......#.",
      "#.#....#.#",
      "#........#",
      "#.#.##.#.#",
      "#........#",
      ".#.#..#.#.",
      "..#....#..",
      "..........",
    ],
    cat15: [
      "...###......#..",
      "..#####....###.",
      "..#####....###.",
      "...###.....###.",
      ".....##..######",
      "......#########",
      "..#############",
      ".##############",
      "###############",
      "###############",
      "###############",
      ".##############",
      "..#############",
      "...###########.",
      ".....#######...",
    ],
  };

  function imgToClues(img) {
    const R = img.length, C = img[0].length;
    const rows = [];
    const cols = Array.from({length:C}, () => []);
    for (let r=0;r<R;r++){
      const row = [];
      let count=0;
      for (let c=0;c<C;c++){
        if (img[r][c] === '#') count++;
        else { if (count>0){ row.push(count); count=0; } }
      }
      if (count>0) row.push(count);
      rows.push(row.length?row:[0]);
    }
    for (let c=0;c<C;c++){
      const col = [];
      let count=0;
      for (let r=0;r<R;r++){
        if (img[r][c] === '#') count++;
        else { if (count>0){ col.push(count); count=0; } }
      }
      if (count>0) col.push(count);
      cols[c] = col.length?col:[0];
    }
    return {rows, cols};
  }

  function setCSSVars(){
    const root = document.documentElement;
    root.style.setProperty('--R', R);
    root.style.setProperty('--C', C);
    // responsive cell size: try to fit screen width (padding ~ 32 + clues area ~ 40%)
    const maxBoardWidth = Math.max(280, Math.min(window.innerWidth - 40, 900));
    const cell = Math.max(22, Math.min(48, Math.floor(maxBoardWidth / (C + 2))));
    root.style.setProperty('--cell', `${cell}px`);
  }

  function resetFromPreset(key){
    const img = PRESETS[key];
    const clues = imgToClues(img);
    rowClues = clues.rows;
    colClues = clues.cols;
    R = rowClues.length;
    C = colClues.length;
    grid = Array.from({length:R}, () => Array(C).fill(0));
    setCSSVars();
    renderAll();
  }

  // --- Rendering ---
  function renderAll(){
    renderClues();
    renderBoard();
  }

  function renderClues(){
    // Row clues grid: one row per puzzle row
    rowCluesEl.innerHTML = '';
    for (let r=0;r<R;r++){
      const wrap = document.createElement('div');
      wrap.className = 'rstack';
      (rowClues[r].length===1 && rowClues[r][0]===0 ? ['0'] : rowClues[r].map(n=>String(n))).forEach((txt,i)=>{
        const n = document.createElement('div');
        n.className = 'num' + (i===rowClues[r].length-1 ? ' strong' : '');
        n.textContent = txt;
        wrap.appendChild(n);
      });
      rowCluesEl.appendChild(wrap);
    }
    // Column clues grid: one column per puzzle col
    colCluesEl.innerHTML = '';
    for (let c=0;c<C;c++){
      const wrap = document.createElement('div');
      wrap.className = 'cstack';
      (colClues[c].length===1 && colClues[c][0]===0 ? ['0'] : colClues[c].map(n=>String(n))).forEach((txt,i)=>{
        const n = document.createElement('div');
        n.className = 'num' + (i===colClues[c].length-1 ? ' strong' : '');
        n.textContent = txt;
        wrap.appendChild(n);
      });
      colCluesEl.appendChild(wrap);
    }
  }

  function renderBoard(){
    boardEl.innerHTML = '';
    const g = document.createElement('div');
    g.className = 'boardgrid';
    for (let r=0;r<R;r++){
      for (let c=0;c<C;c++){
        const cell = document.createElement('div');
        cell.className = 'cell' + (grid[r][c]===1 ? ' full' : grid[r][c]===-1 ? ' x' : '');
        cell.dataset.r = r; cell.dataset.c = c;
        cell.tabIndex = 0;
        cell.addEventListener('click', onClickCell);
        cell.addEventListener('dblclick', (e)=>{ e.preventDefault(); setCell(r,c,-1,true); });
        g.appendChild(cell);
      }
    }
    boardEl.appendChild(g);
  }

  function setCell(r,c,val,highlight=false){
    grid[r][c] = val;
    const idx = r*C + c;
    const cell = boardEl.querySelector('.boardgrid').children[idx];
    cell.className = 'cell' + (val===1 ? ' full' : val===-1 ? ' x' : '');
    if (highlight){
      cell.classList.add('hint');
      setTimeout(()=>cell.classList.remove('hint'), 1200);
    }
  }

  function onClickCell(e){
    const r = +e.currentTarget.dataset.r;
    const c = +e.currentTarget.dataset.c;
    const cur = grid[r][c];
    const nxt = cur===0 ? 1 : cur===1 ? -1 : 0;
    setCell(r,c,nxt,false);
  }

  // --- Line logic (same as before) ---
  function linePlacements(line, clues){
    const N = line.length;
    if (clues.length===1 && clues[0]===0){
      if (line.every(v => v!==1)) return [Array(N).fill(-1)];
      return [];
    }
    const res = [];
    function place(idx, start, acc){
      if (idx === clues.length){
        const arr = acc.slice();
        for (let i = arr.length; i<N; i++){
          if (line[i]===1) return;
          arr[i] = -1;
        }
        res.push(arr);
        return;
      }
      const k = clues[idx];
      for (let s = start; s + (clues.slice(idx).reduce((a,b)=>a+b,0)) + (clues.length-idx-1) <= N; s++){
        const arr = acc.slice();
        for (let i = arr.length; i < s; i++){
          if (line[i]===1) { s = N; break; }
          arr[i] = -1;
        }
        if (arr.length !== s) continue;
        let ok = true;
        for (let i=0;i<k;i++){
          const pos = s+i;
          if (pos>=N || line[pos]===-1) { ok=false; break; }
          arr[pos] = 1;
        }
        if (!ok) continue;
        const after = s+k;
        if (idx < clues.length-1){
          if (after>=N || line[after]===1){ continue; }
          arr[after] = -1;
        }
        place(idx+1, after + (idx < clues.length-1 ? 1 : 0), arr);
      }
    }
    place(0, 0, []);
    return res.filter(arr=>{
      for (let i=0;i<N;i++){
        if (line[i]===1 && arr[i]!==1) return false;
        if (line[i]===-1 && arr[i]===1) return false;
      }
      return true;
    });
  }

  function intersectPlacements(placements){
    if (placements.length===0) return null;
    const N = placements[0].length;
    const out = Array(N).fill(0);
    for (let i=0;i<N;i++){
      let v = placements[0][i];
      let same = true;
      for (let p=1;p<placements.length;p++){
        if (placements[p][i] !== v){ same = false; break; }
      }
      out[i] = same ? v : 0;
    }
    return out;
  }

  function applyLineDeductions(){
    const changes = [];
    for (let r=0;r<R;r++){
      const placements = linePlacements(grid[r], rowClues[r]);
      if (placements.length===0) continue;
      const inter = intersectPlacements(placements);
      for (let c=0;c<C;c++){
        if (inter[c]!==0 && grid[r][c]!==inter[c]){
          grid[r][c] = inter[c];
          changes.push({r,c,val:inter[c]});
        }
      }
    }
    for (let c=0;c<C;c++){
      const col = Array.from({length:R}, (_,r)=>grid[r][c]);
      const placements = linePlacements(col, colClues[c]);
      if (placements.length===0) continue;
      const inter = intersectPlacements(placements);
      for (let r=0;r<R;r++){
        if (inter[r]!==0 && grid[r][c]!==inter[r]){
          grid[r][c] = inter[r];
          changes.push({r,c,val:inter[r]});
        }
      }
    }
    return changes;
  }

  function fullyConsistent(){
    for (let r=0;r<R;r++){
      if (linePlacements(grid[r], rowClues[r]).length===0) return false;
    }
    for (let c=0;c<C;c++){
      const col = Array.from({length:R}, (_,r)=>grid[r][c]);
      if (linePlacements(col, colClues[c]).length===0) return false;
    }
    return true;
  }

  function isSolved(){
    for (let r=0;r<R;r++){
      if (!lineMatches(grid[r], rowClues[r])) return false;
    }
    for (let c=0;c<C;c++){
      const col = Array.from({length:R}, (_,r)=>grid[r][c]);
      if (!lineMatches(col, colClues[c])) return false;
    }
    return true;
  }

  function lineMatches(line, clues){
    const groups = [];
    let count=0;
    for (let v of line){
      if (v===1) count++;
      else { if (count>0){ groups.push(count); count=0; } }
    }
    if (count>0) groups.push(count);
    if (groups.length===0) groups.push(0);
    const norm = (groups.length===1 && groups[0]===0) ? [0] : groups;
    const target = (clues.length===1 && clues[0]===0) ? [0] : clues;
    if (norm.length!==target.length) return false;
    for (let i=0;i<norm.length;i++){
      if (norm[i]!==target[i]) return false;
    }
    if (line.some(v=>v===0)) return false;
    return true;
  }

  function deduceLoop(){
    let any=false;
    while (true){
      const changes = applyLineDeductions();
      if (changes.length===0) break;
      any = true;
    }
    renderBoard();
    return any;
  }

  function hintOnce(){
    const changes = applyLineDeductions();
    if (changes.length>0){
      renderBoard();
      for (const ch of changes){
        const idx = ch.r*C + ch.c;
        const cell = boardEl.querySelector('.boardgrid').children[idx];
        cell.classList.add('hint');
        setTimeout(()=>cell.classList.remove('hint'), 1200);
      }
      return true;
    }
    return false;
  }

  function solve(){
    deduceLoop();
    if (isSolved()) return true;

    function cloneGrid(g){ return g.map(row=>row.slice()); }
    function dfs(){
      if (!fullyConsistent()) return false;
      let progress = true;
      while (progress){
        const changes = applyLineDeductions();
        progress = changes.length>0;
      }
      if (!fullyConsistent()) return false;
      if (isComplete()){
        return isSolved();
      }
      let r=-1,c=-1;
      outer: for (let i=0;i<R;i++){
        for (let j=0;j<C;j++){
          if (grid[i][j]===0){ r=i; c=j; break outer; }
        }
      }
      if (r===-1) return isSolved();
      const snapshot = cloneGrid(grid);
      grid[r][c]=1;
      if (dfs()) return true;
      grid = cloneGrid(snapshot);
      grid[r][c] = -1;
      if (dfs()) return true;
      grid = cloneGrid(snapshot);
      return false;
    }
    function isComplete(){
      for (let i=0;i<R;i++){
        for (let j=0;j<C;j++){
          if (grid[i][j]===0) return false;
        }
      }
      return true;
    }
    const ok = dfs();
    renderBoard();
    return ok;
  }

  // --- Export/Import ---
  function exportJSON(){
    const data = { grid, rowClues, colClues };
    const blob = new Blob([JSON.stringify(data)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'nonogram.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importJSON(file){
    const rdr = new FileReader();
    rdr.onload = () => {
      try {
        const obj = JSON.parse(rdr.result);
        if (!obj || !obj.rowClues || !obj.colClues || !obj.grid) throw new Error('Formato non valido');
        rowClues = obj.rowClues;
        colClues = obj.colClues;
        R = rowClues.length; C = colClues.length;
        grid = obj.grid;
        setCSSVars();
        renderAll();
      } catch(e){
        alert('Errore import: ' + e.message);
      }
    };
    rdr.readAsText(file);
  }

  // --- Wiring buttons ---
  newBtn.addEventListener('click', ()=> resetFromPreset(presetSel.value));
  clearBtn.addEventListener('click', ()=>{
    grid = Array.from({length:R}, () => Array(C).fill(0));
    renderBoard();
  });
  deduceBtn.addEventListener('click', ()=> deduceLoop());
  hintBtn.addEventListener('click', ()=>{
    if (!hintOnce()) alert('Nessuna deduzione immediata trovata.');
  });
  solveBtn.addEventListener('click', ()=>{
    const ok = solve();
    if (!ok) alert('Nessuna soluzione trovata o puzzle ambiguo.');
  });
  checkBtn.addEventListener('click', ()=>{
    alert(isSolved() ? '✅ Risolto correttamente!' : '❌ Non ancora corretto.');
  });
  exportBtn.addEventListener('click', exportJSON);
  importInput.addEventListener('change', (e)=>{
    if (e.target.files && e.target.files[0]) importJSON(e.target.files[0]);
    e.target.value = '';
  });

  // --- PWA install prompt handling ---
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e)=>{
    e.preventDefault(); deferredPrompt = e; installBtn.hidden = false;
  });
  installBtn.addEventListener('click', async ()=>{
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null; installBtn.hidden = true;
  });

  // adapt on resize
  window.addEventListener('resize', setCSSVars, {passive:true});

  // init
  resetFromPreset(presetSel.value);
});
