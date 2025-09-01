/* Nonogram PWA — PezzaliAPP */
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

  function resetFromPreset(key){
    const img = PRESETS[key];
    const clues = imgToClues(img);
    rowClues = clues.rows;
    colClues = clues.cols;
    R = rowClues.length;
    C = colClues.length;
    grid = Array.from({length:R}, () => Array(C).fill(0));
    renderAll();
  }

  // --- Rendering ---
  function renderAll(){
    renderClues();
    renderBoard();
  }

  function renderClues(){
    // Row clues
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
    // Column clues
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
    g.style.gridTemplateColumns = `repeat(${C}, 1fr)`;
    g.style.width = `${Math.min(32*C, 28*C+8)}px`; // responsive-ish
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

  // --- Line logic: generate all placements for a line given clues and current states ---
  // State: 0 unknown, 1 full, -1 x
  function linePlacements(line, clues){
    const N = line.length;
    if (clues.length===1 && clues[0]===0){
      // all must be X
      if (line.every(v => v!==1)) return [Array(N).fill(-1)];
      return []; // impossible if some is full
    }
    const res = [];
    const totalBlocks = clues.reduce((a,b)=>a+b,0);
    const minSpaces = clues.length - 1;
    const minLen = totalBlocks + minSpaces;

    function place(idx, start, acc){
      if (idx === clues.length){
        // fill trailing Xs
        const arr = acc.slice();
        for (let i = arr.length; i<N; i++){
          if (line[i]===1) return; // conflict (must not be full)
          arr[i] = -1;
        }
        res.push(arr);
        return;
      }
      const k = clues[idx];
      for (let s = start; s + (clues.slice(idx).reduce((a,b)=>a+b,0)) + (clues.length-idx-1) <= N; s++){
        // try placing block k at s
        // ensure preceding cell is X (except at start)
        const arr = acc.slice();
        // leading Xs up to s
        for (let i = arr.length; i < s; i++){
          if (line[i]===1) { s = N; break; } // conflict; break outer loop by pushing s to end
          arr[i] = -1;
        }
        if (arr.length !== s) continue; // conflict advanced s, skip
        // place k fulls
        let ok = true;
        for (let i=0;i<k;i++){
          const pos = s+i;
          if (pos>=N || line[pos]===-1) { ok=false; break; }
          arr[pos] = 1;
        }
        if (!ok) continue;
        // trailing X after block (if not last)
        const after = s+k;
        if (idx < clues.length-1){
          if (after>=N || line[after]===1){ continue; }
          arr[after] = -1;
        } else {
          // last block; remaining cells can be X
        }
        place(idx+1, after + (idx < clues.length-1 ? 1 : 0), arr);
      }
    }
    // possible earliest start is 0, latest such that remaining fits
    place(0, 0, []);
    // filter to keep those fully consistent with line (no conflicts)
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
    // one pass on all rows then cols; returns list of changed cells [{r,c,val}]
    const changes = [];
    // rows
    for (let r=0;r<R;r++){
      const placements = linePlacements(grid[r], rowClues[r]);
      if (placements.length===0) continue; // contradiction or nothing
      const inter = intersectPlacements(placements);
      for (let c=0;c<C;c++){
        if (inter[c]!==0 && grid[r][c]!==inter[c]){
          grid[r][c] = inter[c];
          changes.push({r,c,val:inter[c]});
        }
      }
    }
    // cols
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
    // check each row/col has at least one placement consistent
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
    // no unknowns and each line matches clues exactly
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
    // normalize zero case
    const norm = (groups.length===1 && groups[0]===0) ? [0] : groups;
    const target = (clues.length===1 && clues[0]===0) ? [0] : clues;
    if (norm.length!==target.length) return false;
    for (let i=0;i<norm.length;i++){
      if (norm[i]!==target[i]) return false;
    }
    // also ensure no unknowns linger if any block present
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
    const before = JSON.stringify(grid);
    const changes = applyLineDeductions();
    if (changes.length>0){
      renderBoard();
      for (const ch of changes){
        // highlight only first batch; break after few
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
    // first aggressive deductions
    deduceLoop();
    if (isSolved()) return true;

    // choose a cell with ambiguity using heuristic: cell that appears same across row/col intersections?
    // We'll pick first unknown that, when set, keeps consistency.
    function cloneGrid(g){ return g.map(row=>row.slice()); }

    function dfs(){
      if (!fullyConsistent()) return false;
      // deduce
      let progress = true;
      while (progress){
        const changes = applyLineDeductions();
        progress = changes.length>0;
      }
      if (!fullyConsistent()) return false;
      if (isComplete()){
        return isSolved();
      }
      // pick first unknown with some constraints
      let r=-1,c=-1;
      outer: for (let i=0;i<R;i++){
        for (let j=0;j<C;j++){
          if (grid[i][j]===0){ r=i; c=j; break outer; }
        }
      }
      if (r===-1) return isSolved();
      const snapshot = cloneGrid(grid);

      // try fill
      grid[r][c]=1;
      if (dfs()) return true;

      // backtrack & try X
      grid = cloneGrid(snapshot);
      grid[r][c] = -1;
      if (dfs()) return true;

      // neither works
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

  // init
  resetFromPreset(presetSel.value);
});
