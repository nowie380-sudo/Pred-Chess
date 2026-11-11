const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status-message");
const predCountEl = document.getElementById("pred-count");
const whiteCountEl = document.getElementById("white-count");
const capturedCountEl = document.getElementById("captured-count");
const turnLabel = document.getElementById("turn-label");
const moveCountEl = document.getElementById("move-count");

const GLYPHS = {
  K:"♔", Q:"♕", R:"♖", B:"♗", N:"♘", P:"♙", X:"♛"
};
const LEVELS = {easy:5, medium:8, hard:16};
let level = "easy";
let board = [];
let selected = null;
let legalMoves = [];
let turn = "white";
let moveNumber = 1;
let capturedPredators = 0;
let gameOver = false;
let thinking = false;

function freshBoard(){
  board = Array.from({length:8},()=>Array(8).fill(null));
  const back = ["R","N","B","Q","K","B","N","R"];
  for(let c=0;c<8;c++){
    board[7][c]={type:back[c],side:"white"};
    board[6][c]={type:"P",side:"white"};
  }
  // Predators start on the far side. Their count changes with difficulty.
  const count=LEVELS[level];
  const slots=[[0,0],[0,2],[0,4],[0,6],[1,1],[1,3],[1,5],[1,7],
               [0,1],[0,3],[0,5],[0,7],[1,0],[1,2],[1,4],[1,6]];
  for(let i=0;i<count;i++){
    const [r,c]=slots[i];
    board[r][c]={type:"X",side:"black"};
  }
  selected=null;legalMoves=[];turn="white";moveNumber=1;
  capturedPredators=0;gameOver=false;thinking=false;
  render();
  setStatus("Jij bent aan zet. Selecteer een wit stuk.");
}

function inside(r,c){return r>=0&&r<8&&c>=0&&c<8}
function pieceAt(r,c){return inside(r,c)?board[r][c]:null}
function findKing(){
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=board[r][c];if(p&&p.side==="white"&&p.type==="K")return [r,c];
  }
  return null;
}
function rayMoves(r,c,dirs,side,canCapturePred=false){
  const out=[];
  for(const [dr,dc] of dirs){
    let nr=r+dr,nc=c+dc;
    while(inside(nr,nc)){
      const p=board[nr][nc];
      if(!p){out.push([nr,nc]);}
      else{
        if(p.side!==side && (side==="black" || canCapturePred))out.push([nr,nc]);
        break;
      }
      nr+=dr;nc+=dc;
    }
  }
  return out;
}
const ORTHO=[[1,0],[-1,0],[0,1],[0,-1]];
const DIAG=[[1,1],[1,-1],[-1,1],[-1,-1]];
const QUEEN=[...ORTHO,...DIAG];
function pseudoMoves(r,c,opts={}){
  const p=pieceAt(r,c);if(!p)return [];
  const out=[];const side=p.side;const enemy=side==="white"?"black":"white";
  const add=(nr,nc)=>{if(!inside(nr,nc))return;const t=board[nr][nc];if(!t)out.push([nr,nc]);else if(t.side===enemy && (p.type==="K"||p.type==="X"))out.push([nr,nc]);};
  if(p.type==="X")return rayMoves(r,c,QUEEN,"black",false);
  if(p.type==="R")return rayMoves(r,c,ORTHO,side);
  if(p.type==="B")return rayMoves(r,c,DIAG,side);
  if(p.type==="Q")return rayMoves(r,c,QUEEN,side);
  if(p.type==="N"){
    for(const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])add(r+dr,c+dc);
  }
  if(p.type==="K"){
    for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)if(dr||dc)add(r+dr,c+dc);
  }
  if(p.type==="P"){
    const dir=-1;
    if(inside(r+dir,c)&&!board[r+dir][c]){
      out.push([r+dir,c]);
      if(r===6&&!board[r+2*dir][c])out.push([r+2*dir,c]);
    }
    for(const dc of [-1,1]){
      const nr=r+dir,nc=c+dc,t=pieceAt(nr,nc);
      if(t&&t.side==="black"){} // Non-king white pieces cannot capture predators.
      else if(t&&t.side==="white"){}
      // Pawns may capture no predators; predators cannot occupy a pawn's diagonal target.
    }
  }
  return out;
}
function isSquareAttackedByPredator(r,c,ignoreIndex=null){
  // A predator attacks along queen lines; any intervening piece blocks its ray.
  for(let pr=0;pr<8;pr++)for(let pc=0;pc<8;pc++){
    const p=board[pr][pc];if(!p||p.type!=="X")continue;
    if(pr===r&&pc===c)continue;
    const dr=r-pr,dc=c-pc;
    if(!(dr===0||dc===0||Math.abs(dr)===Math.abs(dc)))continue;
    const sr=Math.sign(dr),sc=Math.sign(dc);let nr=pr+sr,nc=pc+sc,blocked=false;
    while(nr!==r||nc!==c){
      if(board[nr][nc]){blocked=true;break;}
      nr+=sr;nc+=sc;
    }
    if(!blocked)return true;
  }
  return false;
}
function isKingInCheck(){
  const k=findKing();return k?isSquareAttackedByPredator(k[0],k[1]):true;
}
function applyMove(from,to){
  const p=board[from[0]][from[1]];
  const target=board[to[0]][to[1]];
  if(!p)return false;
  if(p.type!=="K"&&target&&target.side==="black")return false;
  if(p.type==="K"&&target&&target.type==="X")capturedPredators++;
  board[to[0]][to[1]]=p;board[from[0]][from[1]]=null;
  return true;
}
function cloneBoard(b){return b.map(row=>row.map(p=>p?{...p}:null))}
function legalWhiteMoves(r,c){
  const p=pieceAt(r,c);if(!p||p.side!=="white")return [];
  const candidates=pseudoMoves(r,c);
  return candidates.filter(([nr,nc])=>{
    if(p.type!=="K"&&board[nr][nc])return false;
    const old=cloneBoard(board);
    const oldCaptured=capturedPredators;
    applyMove([r,c],[nr,nc]);
    const safe=!isKingInCheck();
    board=old;
    capturedPredators=oldCaptured;
    return safe;
  });
}
function allWhiteLegalMoves(){
  const moves=[];
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=board[r][c];if(p&&p.side==="white")for(const to of legalWhiteMoves(r,c))moves.push({from:[r,c],to});
  }
  return moves;
}
function predatorCaptureOptions(){
  const options=[];
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=board[r][c];if(!p||p.type!=="X")continue;
    for(const [nr,nc] of rayMoves(r,c,QUEEN,"black",false)){
      const target=board[nr][nc];
      if(target&&target.side==="white"&&target.type!=="K")options.push({from:[r,c],to:[nr,nc]});
    }
  }
  return options;
}
function predatorMoves(){
  const captures=predatorCaptureOptions();
  if(captures.length)return captures;
  const options=[];
  const targets=[];
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=board[r][c];if(p&&p.side==="white"&&p.type!=="K")targets.push([r,c]);
  }
  const king=findKing();if(king)targets.push(king);
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=board[r][c];if(!p||p.type!=="X")continue;
    for(const to of rayMoves(r,c,QUEEN,"black",false)){
      if(board[to[0]][to[1]]) continue; // Predators never move onto the king; checkmate is by attack.
      // Prefer moves that reduce distance to the nearest remaining white piece.
      const before=Math.min(...targets.map(t=>Math.max(Math.abs(t[0]-r),Math.abs(t[1]-c))));
      const after=Math.min(...targets.map(t=>Math.max(Math.abs(t[0]-to[0]),Math.abs(t[1]-to[1]))));
      options.push({from:[r,c],to,score:before-after+Math.random()*0.15});
    }
  }
  options.sort((a,b)=>b.score-a.score);
  return options.slice(0,Math.min(12,options.length));
}
function countPieces(side,type=null){
  let n=0;for(const row of board)for(const p of row)if(p&&p.side===side&&(!type||p.type===type))n++;return n;
}
function finishIfNeeded(){
  if(countPieces("black","X")===0){gameOver=true;turnLabel.textContent="GEWONNEN";setStatus("Gewonnen! Alle predators zijn uitgeschakeld.");return true;}
  const moves=allWhiteLegalMoves();
  if(moves.length===0){
    gameOver=true;
    if(isKingInCheck()){turnLabel.textContent="SCHAAKMAT";setStatus("Schaakmat. Je koning heeft geen veilige zet meer.");}
    else{turnLabel.textContent="PAT";setStatus("Pat: er zijn geen veilige zetten meer. Probeer een nieuw spel.");}
    return true;
  }
  return false;
}
function setStatus(msg){statusEl.textContent=msg}
function doWhiteMove(from,to){
  const target=board[to[0]][to[1]];
  applyMove(from,to);
  selected=null;legalMoves=[];turn="black";
  if(target&&target.type==="X")setStatus("Je koning heeft een predator uitgeschakeld.");
  render();
  if(!finishIfNeeded())setTimeout(doPredatorTurn,450);
}
function doPredatorTurn(){
  if(gameOver)return;
  thinking=true;turnLabel.textContent="PREDATORS AAN ZET";setStatus("De predators bewegen...");
  const choices=predatorMoves();
  if(!choices.length){thinking=false;turn="white";moveNumber++;render();finishIfNeeded();return;}
  // If the king is the only available target and the move creates check, it is allowed.
  const chosen=choices[Math.floor(Math.random()*Math.min(choices.length,4))];
  const target=board[chosen.to[0]][chosen.to[1]];
  board[chosen.to[0]][chosen.to[1]]=board[chosen.from[0]][chosen.from[1]];
  board[chosen.from[0]][chosen.from[1]]=null;
  thinking=false;turn="white";moveNumber++;
  render();
  if(finishIfNeeded())return;
  if(isKingInCheck())setStatus("Schaak! Je koning wordt bedreigd. Vind een veilige zet.");
  else setStatus("Jij bent aan zet. Bescherm je stukken.");
}
function onSquareClick(r,c){
  if(gameOver||turn!=="white"||thinking)return;
  const p=board[r][c];
  if(selected){
    const move=legalMoves.find(([mr,mc])=>mr===r&&mc===c);
    if(move){doWhiteMove(selected,[r,c]);return;}
  }
  if(p&&p.side==="white"){
    selected=[r,c];legalMoves=legalWhiteMoves(r,c);render();
    if(legalMoves.length===0)setStatus(p.type==="K"?"De koning heeft hier geen veilige zetten.":"Dit stuk heeft momenteel geen toegestane zetten.");
    else setStatus("Kies een gemarkeerd vakje om te verplaatsen.");
  }else{
    selected=null;legalMoves=[];render();
  }
}
function render(){
  boardEl.innerHTML="";
  const king=findKing();const inCheck=king&&isKingInCheck();
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const sq=document.createElement("button");
    sq.className="square "+((r+c)%2===0?"light":"dark");
    sq.setAttribute("role","gridcell");sq.setAttribute("aria-label",`${8-r}${String.fromCharCode(97+c)}`);
    if(selected&&selected[0]===r&&selected[1]===c)sq.classList.add("selected");
    const target=legalMoves.some(([mr,mc])=>mr===r&&mc===c);
    if(target)sq.classList.add(board[r][c]?"capture-target":"move-target");
    if(inCheck&&king&&king[0]===r&&king[1]===c)sq.classList.add("check");
    if(c===0){const coord=document.createElement("span");coord.className="coord";coord.textContent=8-r;sq.appendChild(coord);}
    if(r===7){const coord=document.createElement("span");coord.className="coord";coord.style.left="auto";coord.style.top="auto";coord.style.right="4px";coord.style.bottom="2px";coord.textContent=String.fromCharCode(97+c);sq.appendChild(coord);}
    const p=board[r][c];
    if(p){const piece=document.createElement("span");piece.className=`piece ${p.side} ${p.type==="X"?"predator":""}`;piece.textContent=GLYPHS[p.type];sq.appendChild(piece);}
    sq.addEventListener("click",()=>onSquareClick(r,c));boardEl.appendChild(sq);
  }
  predCountEl.textContent=countPieces("black","X");
  whiteCountEl.textContent=countPieces("white");
  capturedCountEl.textContent=capturedPredators;
  moveCountEl.textContent=`ZET ${moveNumber}`;
  if(!gameOver)turnLabel.textContent=turn==="white"?"JOUW BEURT":"PREDATORS AAN ZET";
}
document.querySelectorAll(".difficulty").forEach(btn=>{
  btn.addEventListener("click",()=>{
    document.querySelectorAll(".difficulty").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");level=btn.dataset.level;
    freshBoard();
  });
});
document.getElementById("new-game").addEventListener("click",freshBoard);
freshBoard();
