/* Nonogram (Picross) — PWA in una cartella
   Interazione:
   - Tap/click: alterna Vuoto → Pieno → X → Vuoto
   - Doppio tap: X immediato
   - “Deduci”: applica line-solver (intersezione delle configurazioni valide per riga/colonna)
   - “Risolvi”: deduzioni + backtracking (1 soluzione)
*/
document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // --- DOM ---
  const boardEl   = document.getElementById('board');
  const rowCluesEl= document.getElementById('rowClues');
  const colCluesEl= document.getElementById('colClues');
  const presetSel = document.getElementById('preset');
  const newBtn    = document.getElementById('newBtn');
  const clearBtn  = document.getElementById('clearBtn');
  const checkBtn  = document.getElementById('checkBtn');
  const hintBtn   = document.getElementById('hintBtn');
  const solveBtn  = document.getElementById('solveBtn');
  const statusEl  = document.getElementById('status');

  const jsonPanel = document.getElementById('jsonPanel');
  const jsonInput = document.getElementById('jsonInput');
  const applyJson = document.getElementById('applyJson');
  const cancelJson= document.getElementById('cancelJson');

  const setStatus = (t) => { statusEl.textContent = t; };

  // --- Stato ---
  // 0 = ignoto, 1 = pieno, -1 = X (vuoto)
  let W=10, H=10;
  let rows=[], cols=[];
  let grid=[]; // array H x W (flat)

  // --- Preset semplici ---
  const PRESETS = {
    "5x5-heart": {
      w:5, h:5,
      rows: [[1,1],[3],[5],[3],[1]],
      cols: [[1],[3],[5],[3],[1]]
    },
    "10x10-smile": {
      w:10, h:10,
      rows: [[2,2],[2,2],[10],[2,2],[2,2],[2,2],[10],[3,3],[2,2],[2,2]],
      cols: [[2,2],[2,2],[10],[2,2],[2,2],[2,2],[10],[3,3],[2,2],[2,2]]
    },
    "15x10-rocket": {
      w:15, h:10,
      rows: [[3],[5],[3,3],[3,3],[15],[5,5],[3,3],[3,3],[5],[3]],
      cols: [[1],[3],[5],[7],[9],[11],[13],[15],[11],[9],[7],[5],[3],[1],[1]]
    }
  };

  // --- Utilità ---
  const idx = (r,c)=> r*W + c;
  const inb = (r,c)=> r>=0 && r<H && c>=0 && c<W;

  function resetGrid(){
    grid = new Array(W*H).fill(0);
  }

  function renderClues(){
    // righe
    rowCluesEl.style.gridTemplateRows = `repeat(${H}, var(--cell))`;
    rowCluesEl.innerHTML = '';
    for (let r=0;r<H;r++){
      const div = document.createElement('div');
      div.className = 'clue' + (rows[r].length? '' : ' empty');
      rows[r].forEach(n => {
        const s = document.createElement('span'); s.textContent = n;
        div.appendChild(s);
      });
      rowCluesEl.appendChild(div);
    }
    // colonne
    colCluesEl.style.gridTemplateColumns = `repeat(${W}, var(--cell))`;
    colCluesEl.innerHTML = '';
    for (let c=0;c<W;c++){
      const div = document.createElement('div');
      div.className = 'clue' + (cols[c].length? '' : ' empty');
      // verticalizza i numeri: ogni span a capo
      div.style.display = 'flex';
      div.style.flexDirection = 'column';
      div.style.alignItems = 'center';
      cols[c].forEach(n => {
        const s = document.createElement('span'); s.textContent = n;
        div.appendChild(s);
      });
      colCluesEl.appendChild(div);
    }
  }

  function renderBoard(){
    boardEl.style.setProperty('--w', W);
    boardEl.style.setProperty('--h', H);
    boardEl.innerHTML = '';
    for (let r=0;r<H;r++){
      for (let c=0;c<W;c++){
        const cell = document.createElement('div');
        cell.className = 'cell' + (((r+c)%2===1)?' dark':'');
        const k = idx(r,c);
        setCellClass(cell, grid[k]);

        // Interazione
        let lastTap = 0;
        cell.addEventListener('click', () => {
          const now = Date.now();
          if (now - lastTap < 260) {
            // doppio tap => X
            grid[k] = -1;
          } else {
            // ciclo: 0 -> 1 -> -1 -> 0
            grid[k] = (grid[k]===0) ? 1 : (grid[k]===1 ? -1 : 0);
          }
          lastTap = now;
          setCellClass(cell, grid[k]);
        });

        // drag “pittura” (desktop)
        cell.addEventListener('pointerdown', (e)=>{
          e.preventDefault();
          const startVal = (grid[k]===1) ? -1 : 1; // alterna rapido
          const paint = (rr,cc)=>{
            if (!inb(rr,cc)) return;
            const kk=idx(rr,cc);
            grid[kk] = startVal;
            const el = boardEl.children[kk];
            setCellClass(el, grid[kk]);
          };
          paint(r,c);
          const move = (ev)=>{
            const rect = boardEl.getBoundingClientRect();
            const x = ev.clientX, y=ev.clientY;
            const col = Math.floor((x - rect.left)/ (rect.width/W));
            const row = Math.floor((y - rect.top)/ (rect.height/H));
            paint(row,col);
          };
          const up = ()=>{
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
          };
          window.addEventListener('pointermove', move, {passive:true});
          window.addEventListener('pointerup', up, {passive:true});
        }, {passive:false});

        boardEl.appendChild(cell);
      }
    }
  }

  function setCellClass(el, v){
    el.classList.remove('fill','cross');
    if (v===1) el.classList.add('fill');
    else if (v===-1) el.classList.add('cross');
  }

  // --- Parsing JSON custom ---
  function showJsonPanel(){
    jsonPanel.hidden = false;
    jsonInput.value = JSON.stringify({ w: W, h: H, rows, cols }, null, 2);
  }
  function hideJsonPanel(){ jsonPanel.hidden = true; }

  // --- Line solver (deduzioni su una riga/colonna) ---
  // Dato un array target di lunghezze [3,1,...] e uno stato parziale (array di -1/0/1) produce
  // tutte le configurazioni valide per quella linea (0/1). Restituisce array di possibili linee.
  function lineConfigurations(length, blocks, partial){
    const totalFilled = blocks.reduce((a,b)=>a+b,0);
    const minSpaces = blocks.length > 0 ? (blocks.length - 1) : 0;
    const need = totalFilled + minSpaces;
    if (blocks.length===0){
      // tutto vuoto
      for (let i=0;i<length;i++){
        if (partial[i]===1) return []; // impossibile
      }
      return [ new Array(length).fill(0) ];
    }
    if (need > length) return [];

    const res = [];
    function place(blockIdx, startPos, arr){
      if (blockIdx === blocks.length){
        // riempi il resto con 0
        for (let i=startPos;i<length;i++){
          if (partial[i]===1) return; // conflitto
          arr[i]=0;
        }
        res.push(arr.slice());
        return;
      }
      const bLen = blocks[blockIdx];

      for (let pos = startPos; pos + bLen <= length; pos++){
        // 1) Zeri obbligatori tra startPos e pos-1
        let okZeros = true;
        for (let z=startPos; z<pos; z++){
          if (partial[z]===1){ okZeros = false; break; } // non può essere pieno
          arr[z]=0;
        }
        if (!okZeros){
          // questa posizione "pos" è impossibile, prova la successiva
          // (ripristino non strettamente necessario: gli zeri rimangono zeri)
          continue;
        }

        // 2) Metti il blocco pieno
        let ok=true;
        for (let j=0;j<bLen;j++){
          if (partial[pos+j]===-1){ ok=false; break; } // non può essere X
          arr[pos+j]=1;
        }
        if (!ok) {
          // ripulisci e passa oltre
          for (let j=0;j<bLen;j++) arr[pos+j]=0;
          continue;
        }

        // 3) Se non è l'ultimo blocco, imponi almeno uno zero di separazione
        let nextStart = pos+bLen;
        if (blockIdx < blocks.length-1){
          if (nextStart>=length) {
            // non c'è spazio per lo zero separatore
            for (let j=0;j<bLen;j++) arr[pos+j]=0;
            continue;
          }
          if (partial[nextStart]===1){
            // deve essere 0, conflitto
            for (let j=0;j<bLen;j++) arr[pos+j]=0;
            continue;
          }
          arr[nextStart]=0;
          nextStart++;
        }

        // 4) Ricorsione per il blocco successivo
        place(blockIdx+1, nextStart, arr);

        // 5) Ripristina il blocco prima di iterare pos++
        for (let j=0;j<bLen;j++) arr[pos+j]=0;
        if (blockIdx < blocks.length-1){
          arr[pos+bLen]=0; // resta 0 come separatore (non fa danni)
        }
      }
    }
    place(0,0,new Array(length).fill(0));

    // Filtra per coerenza con partial dove partial=1 deve essere 1, partial=-1 deve essere 0
    return res.filter(arr=>{
      for (let i=0;i<length;i++){
        if (partial[i]===1 && arr[i]!==1) return false;
        if (partial[i]===-1 && arr[i]!==0) return false;
      }
      return true;
    });
  }

  // Applica deduzioni: per una linea, calcola intersezione delle config → celle certe
  function deduceLine(length, blocks, partial){
    const configs = lineConfigurations(length, blocks, partial);
    if (configs.length===0) return {changed:false, impossible:true};
    const out = partial.slice();
    let changed=false;
    for (let i=0;i<length;i++){
      let all1=true, all0=true;
      for (const conf of configs){
        if (conf[i]!==1) all1=false;
        if (conf[i]!==0) all0=false;
        if (!all1 && !all0) break;
      }
      if (all1 && out[i]!==1){ out[i]=1; changed=true; }
      else if (all0 && out[i]!==-1){ out[i]=-1; changed=true; }
    }
    return { line: out, changed, impossible:false, configsCount: configs.length };
  }

  function getRow(r){
    const a=new Array(W);
    for (let c=0;c<W;c++) a[c]=grid[idx(r,c)];
    return a;
  }
  function setRow(r, arr){
    for (let c=0;c<W;c++) grid[idx(r,c)] = arr[c];
  }
  function getCol(c){
    const a=new Array(H);
    for (let r=0;r<H;r++) a[r]=grid[idx(r,c)];
    return a;
  }
  function setCol(c, arr){
    for (let r=0;r<H;r++) grid[idx(r,c)] = arr[r];
  }

  // Esegue deduzioni fino a fissare punto
  function propagate(){
    let changed=true;
    while (changed){
      changed=false;
      // righe
      for (let r=0;r<H;r++){
        const d = deduceLine(W, rows[r], getRow(r));
        if (d.impossible) return false;
        if (d.changed){ setRow(r, d.line); changed=true; }
      }
      // colonne
      for (let c=0;c<W;c++){
        const d = deduceLine(H, cols[c], getCol(c));
        if (d.impossible) return false;
        if (d.changed){ setCol(c, d.line); changed=true; }
      }
    }
    return true;
  }

  function isComplete(){
    return grid.every(v => v!==0);
  }

  // Backtracking: scegli la linea (riga o colonna) con meno configurazioni > 1
  function chooseBranchLine(){
    let best = null;
    // righe
    for (let r=0;r<H;r++){
      const configs = lineConfigurations(W, rows[r], getRow(r));
      if (configs.length>1){
        if (!best || configs.length < best.count) best = {type:'row', idx:r, count:configs.length, configs};
      } else if (configs.length===0){
        return {type:'row', idx:r, count:0, configs:[]};
      }
    }
    // colonne
    for (let c=0;c<W;c++){
      const configs = lineConfigurations(H, cols[c], getCol(c));
      if (configs.length>1){
        if (!best || configs.length < best.count) best = {type:'col', idx:c, count:configs.length, configs};
      } else if (configs.length===0){
        return {type:'col', idx:c, count:0, configs:[]};
      }
    }
    return best; // può essere null se tutto ha config 0/1
  }

  function cloneState(){
    return {
      grid: grid.slice()
    };
  }
  function restoreState(snap){
    grid = snap.grid.slice();
  }

  function solve(limitSolutions=1){
    // deduzioni iniziali
    if (!propagate()) return []; // contraddizione
    const sols=[];
    function dfs(){
      if (sols.length>=limitSolutions) return;
      if (isComplete()){ sols.push(grid.slice()); return; }

      const pick = chooseBranchLine();
      if (!pick){ // niente da scegliere ma non completo => errore
        return;
      }
      if (pick.count===0) return; // impossibile

      const snapshot = cloneState();
      for (const conf of pick.configs){
        if (pick.type==='row') setRow(pick.idx, conf);
        else setCol(pick.idx, conf);

        if (propagate()){
          dfs();
          if (sols.length>=limitSolutions) return;
        }
        restoreState(snapshot);
      }
    }
    dfs();
    return sols;
  }

  // --- Verifica coerenza parziale con clues (non prova a risolvere) ---
  function checkConsistency(){
    // helper: data una linea attuale (-1/0/1), verifica che non violi i blocchi (solo parziale)
    function lineOk(length, blocks, arr){
      // Costruisci blocchi “1” correnti
      const blocksSeen=[];
      let run=0;
      for (let i=0;i<length;i++){
        if (arr[i]===1) run++;
        else {
          if (run>0){ blocksSeen.push(run); run=0; }
        }
      }
      if (run>0) blocksSeen.push(run);

      // Non può avere blocchi più lunghi di quelli target
      for (let i=0;i<blocksSeen.length;i++){
        if (blocksSeen[i] > (blocks[i]||Infinity)) return false;
      }
      // Se ha già completato più blocchi di quelli target → incoerente
      if (blocksSeen.length > blocks.length) return false;

      return true;
    }
    for (let r=0;r<H;r++){
      if (!lineOk(W, rows[r], getRow(r))) return false;
    }
    for (let c=0;c<W;c++){
      if (!lineOk(H, cols[c], getCol(c))) return false;
    }
    return true;
  }

  // --- UI: azioni ---
  newBtn.addEventListener('click', ()=>{
    const v = presetSel.value;
    if (v==='custom'){
      showJsonPanel();
      setStatus('Incolla un JSON e premi “Applica”.');
      return;
    }
    const p = PRESETS[v];
    W=p.w; H=p.h; rows=p.rows.map(a=>a.slice()); cols=p.cols.map(a=>a.slice());
    resetGrid(); renderClues(); renderBoard();
    setStatus('Preset caricato.');
  });

  clearBtn.addEventListener('click', ()=>{
    resetGrid(); renderBoard();
    setStatus('Griglia svuotata.');
  });

  checkBtn.addEventListener('click', ()=>{
    const ok = checkConsistency();
    setStatus(ok ? '✅ Coerente finora.' : '⛔ Incoerente con gli indizi.');
  });

  hintBtn.addEventListener('click', ()=>{
    const before = grid.slice();
    const ok = propagate();
    if (!ok){ setStatus('⛔ Contraddizione: controlla le celle segnate.'); renderBoard(); return; }
    renderBoard();
    const changed = before.some((v,i)=> v!==grid[i]);
    setStatus(changed ? '✨ Deduzioni applicate.' : 'ℹ️ Nessuna deduzione trovata.');
  });

  solveBtn.addEventListener('click', ()=>{
    const sols = solve(1);
    if (!sols.length){ setStatus('😕 Nessuna soluzione trovata.'); return; }
    grid = sols[0].slice();
    renderBoard(); setStatus('✅ Soluzione applicata.');
  });

  applyJson.addEventListener('click', ()=>{
    try{
      const obj = JSON.parse(jsonInput.value);
      if (!obj || !Array.isArray(obj.rows) || !Array.isArray(obj.cols)) throw 0;
      W = obj.w|0; H = obj.h|0;
      rows = obj.rows.map(a=>a.slice());
      cols = obj.cols.map(a=>a.slice());
      hideJsonPanel();
      resetGrid(); renderClues(); renderBoard();
      setStatus('Puzzle custom caricato.');
    }catch(e){
      setStatus('⛔ JSON non valido.');
    }
  });
  cancelJson.addEventListener('click', ()=>{ hideJsonPanel(); setStatus(''); });

  // --- Avvio con preset default ---
  (function init(){
    const p = PRESETS[presetSel.value];
    W=p.w; H=p.h; rows=p.rows.map(a=>a.slice()); cols=p.cols.map(a=>a.slice());
    resetGrid(); renderClues(); renderBoard();
  })();
});
